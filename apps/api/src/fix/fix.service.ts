import { type Diagnosis, type Incident, promoteToFront, type WorkItem } from '@graveshift/core';
import { type Patch, type PrRef, openDraftPr } from '@graveshift/fixer';
import { generatePatch, type RepoRules } from '@graveshift/patch';
import { decide, type Effect } from '@graveshift/policy';
import { Inject, Injectable } from '@nestjs/common';

import { FIX_DEPS, type FixDeps } from './fix.types';

// Incident and diagnosis fields come from the work item. No new data is invented,
// and no model or daemon read supplies a permission.
function toIncidentAndDiagnosis(
  item: WorkItem,
  note?: string,
): { incident: Incident; diagnosis: Diagnosis } {
  const now = new Date().toISOString();
  const incident: Incident = {
    id: item.diagnosisRef,
    service: item.service,
    state: 'diagnosed',
    signalIds: [item.diagnosisRef],
    openedAt: now,
    updatedAt: now,
  };
  const diagnosis: Diagnosis = {
    id: `dia-${item.diagnosisRef}`,
    incidentId: incident.id,
    rootCause: item.description || item.title,
    evidence: [
      { ref: item.diagnosisRef, excerpt: item.title },
      ...(note === undefined ? [] : [{ ref: 'fix-now-note', excerpt: note }]),
    ],
    confidence: 1,
    createdAt: now,
  };
  return { incident, diagnosis };
}

export type FixTrigger = 'auto_fix' | 'fix_now';

export interface FixResult {
  readonly item: WorkItem;
  readonly trigger: FixTrigger;
  readonly effect: Effect;
  readonly ok: boolean;
  readonly pr?: PrRef;
  readonly reason?: string;
}

const rulesFrom = (repo: FixDeps['repo']): RepoRules => ({
  maxFilesChanged: repo.maxFilesChanged,
  maxLinesChanged: repo.maxLinesChanged,
  allowedPaths: repo.allowedPaths,
  forbiddenPaths: repo.forbiddenPaths,
});

// Both triggers enter here. The policy gate runs before the patch call and before
// any GitHub client call. Model output never grants permission.
@Injectable()
export class FixService {
  constructor(@Inject(FIX_DEPS) private readonly deps: FixDeps) {}

  async autoFix(item: WorkItem, note?: string): Promise<FixResult> {
    if (!item.autoFixAllowed) {
      return { item, trigger: 'auto_fix', effect: 'deny', ok: false, reason: 'auto_fix_disabled' };
    }
    return this.run(item, 'auto_fix', note);
  }

  async fixNow(item: WorkItem, note?: string): Promise<FixResult> {
    return this.run(item, 'fix_now', note);
  }

  private async run(item: WorkItem, trigger: FixTrigger, note?: string): Promise<FixResult> {
    const { policy, repo, gateway, client, agent, envMode } = this.deps;
    const decision = decide(
      policy,
      {
        service: item.service,
        category: 'code_bug',
        signals: [item.diagnosisRef],
        confidence: 1,
        ...(envMode === undefined ? {} : { envMode }),
        counters: {
          openPrsLastHour: 0,
          actionsLast10Min: 0,
          diagnosisLoops: 0,
          llmSpentTodayUsd: 0,
        },
      },
      { name: 'open_pr' },
    );

    const next = trigger === 'fix_now' ? promoteToFront(item) : item;
    if (decision.effect !== 'allow') {
      return {
        item: next,
        trigger,
        effect: decision.effect,
        ok: false,
        reason: decision.reason,
      };
    }

    const generated = await generatePatch({
      gateway,
      agent,
      rules: rulesFrom(repo),
      diagnosis: item.description || item.title,
    });
    if (!generated.ok) {
      return {
        item: next,
        trigger,
        effect: decision.effect,
        ok: false,
        reason: generated.error.message,
      };
    }

    const { incident, diagnosis } = toIncidentAndDiagnosis(item, note);
    const patch: Patch = generated.patch;
    // openDraftPr runs guardPatch before its first client call.
    const pr = await openDraftPr({
      client,
      repo,
      patch,
      incident,
      diagnosis,
      category: 'code_bug',
      dashboardUrl: '',
    });
    return { item: next, trigger, effect: decision.effect, ok: true, pr };
  }
}
