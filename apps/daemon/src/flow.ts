import type { Diagnosis, Incident } from '@graveshift/core';
import type { DiagnoseInput, DiagnoseResult } from '@graveshift/diagnoser';
import type { PrRef } from '@graveshift/fixer';
import { decide, type Policy } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';
import type { AuditStore } from '@graveshift/store';
import type { Outcome } from '@graveshift/watcher';

import type { Registry } from './registry';

export interface Notification {
  incidentId: string;
  service: string;
  kind: 'incident.opened' | 'incident.diagnosed' | 'incident.needs_human' | 'pr.opened';
  summary: string;
}

// Banshee (Discord) lands in issue #13; until then notifications go nowhere.
export interface Notifier {
  notify(notification: Notification): Promise<void>;
}
export const noopNotifier: Notifier = { notify: async () => {} };

export interface FixRequest {
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
}

export interface FlowDeps {
  registry: Registry;
  audit: AuditStore;
  policy: Policy;
  envMode?: string;
  diagnose: (input: DiagnoseInput) => Promise<DiagnoseResult>;
  tailLogs: (service: string) => Promise<string[]>;
  // returns null when no patch is available; the Exorcist is optional until patch generation lands
  openFix?: (request: FixRequest) => Promise<PrRef | null>;
  notifier?: Notifier;
  warn?: (message: string) => void;
}

const POLICY_SIGNAL: Record<string, string> = {
  'runtime.oom': 'oom_killed',
  'runtime.restart-loop': 'restart_loop',
};

export function createFlow(deps: FlowDeps) {
  const { registry, audit, policy, notifier = noopNotifier, warn = () => {} } = deps;
  const busy = new Set<string>();
  const openPrs: number[] = [];

  const record = (type: string, incidentId: string, payload: Record<string, unknown>) =>
    audit.append({
      actor: 'daemon',
      type,
      incidentId,
      payload: JSON.parse(redact(JSON.stringify(payload))) as Record<string, unknown>,
    });

  async function diagnoseAndFix(incidentId: string): Promise<void> {
    const view = registry.get(incidentId);
    if (!view) return;
    registry.setState(incidentId, 'diagnosing', 'Medium is reading logs and signals');
    const logs = await deps.tailLogs(view.incident.service).catch(() => []);
    const result = await deps.diagnose({
      incident: view.incident,
      detections: view.detections,
      logs,
      files: [],
      commits: [],
    });
    if (result.status === 'needs_human') {
      registry.needsHuman(incidentId, result.reason);
      registry.setState(incidentId, 'open', 'diagnosis needs a human');
      await record('diagnosis.needs_human', incidentId, { reason: result.reason });
      await notifier.notify({
        incidentId,
        service: view.incident.service,
        kind: 'incident.needs_human',
        summary: result.reason,
      });
      return;
    }
    registry.setDiagnosis(incidentId, result.diagnosis, result.category, result.source);
    registry.setState(incidentId, 'diagnosed', result.diagnosis.rootCause);
    await record('diagnosis.created', incidentId, {
      category: result.category,
      confidence: result.diagnosis.confidence,
      source: result.source,
      rootCause: result.diagnosis.rootCause,
    });
    await notifier.notify({
      incidentId,
      service: view.incident.service,
      kind: 'incident.diagnosed',
      summary: result.diagnosis.rootCause,
    });

    const hourAgo = Date.now() - 3_600_000;
    const decision = decide(
      policy,
      {
        service: view.incident.service,
        category: result.category,
        signals: view.detections.map((d) => POLICY_SIGNAL[d.rule] ?? d.rule),
        confidence: result.diagnosis.confidence,
        ...(deps.envMode ? { envMode: deps.envMode } : {}),
        counters: {
          openPrsLastHour: openPrs.filter((t) => t > hourAgo).length,
          actionsLast10Min: 0,
          diagnosisLoops: 0,
          llmSpentTodayUsd: 0,
        },
      },
      { name: 'open_pr' },
    );
    await record('policy.decision', incidentId, {
      action: 'open_pr',
      effect: decision.effect,
      matchedRule: decision.matchedRule,
      reasons: decision.reasons,
    });
    registry.note(incidentId, 'policy', `open_pr: ${decision.effect} (${decision.reason})`);
    if (decision.effect !== 'allow' || !deps.openFix) return;

    const pr = await deps.openFix({
      incident: view.incident,
      diagnosis: result.diagnosis,
      category: result.category,
    });
    if (!pr) return;
    openPrs.push(Date.now());
    registry.setPr(incidentId, { url: pr.url, number: pr.number, branch: pr.branch });
    await record('pr.opened', incidentId, {
      url: pr.url,
      number: pr.number,
      branch: pr.branch,
      draft: true,
    });
    await notifier.notify({
      incidentId,
      service: view.incident.service,
      kind: 'pr.opened',
      summary: pr.url,
    });
  }

  return {
    async onOutcome(outcome: Outcome): Promise<void> {
      if (outcome.status !== 'accepted') return;
      const { change, detection } = outcome;
      const id = change.incident.id;
      registry.upsert(change.incident, change.severity, change.detections, {
        type: `signal.${detection.rule}`,
        detail: detection.message,
      });
      await record(change.type === 'opened' ? 'incident.opened' : 'incident.signal', id, {
        rule: detection.rule,
        service: detection.service,
        severity: change.severity,
        message: detection.message,
      });
      if (change.type === 'opened') {
        await notifier.notify({
          incidentId: id,
          service: detection.service,
          kind: 'incident.opened',
          summary: detection.message,
        });
      }
      const state = registry.get(id)?.incident.state;
      if (busy.has(id) || (state !== 'open' && change.type !== 'opened')) return;
      busy.add(id);
      try {
        await diagnoseAndFix(id);
      } catch (error) {
        warn(`flow failed for ${id}: ${error instanceof Error ? error.message : 'unknown'}`);
      } finally {
        busy.delete(id);
      }
    },
  };
}
