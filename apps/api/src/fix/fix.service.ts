import { wrapUntrusted } from '@graveshift/agents/untrusted';
import {
  type Diagnosis,
  type Incident,
  promoteToFront,
  type WorkItem,
  withDraftPr,
} from '@graveshift/core';
import { type Patch, type PrRef, openDraftPr } from '@graveshift/fixer';
import { generatePatch, type RepoRules } from '@graveshift/patch';
import { decide, type Effect } from '@graveshift/policy';
import { Inject, Injectable } from '@nestjs/common';

import {
  type FixContext,
  FixContextSchema,
  FIX_DEPS,
  type FixDeps,
  type FixFailureCode,
} from './fix.types';

// Every value below is request data. Wrapping keeps tags and secrets out of the PR body.
function toIncidentAndDiagnosis(
  item: WorkItem,
  context: FixContext,
  note?: string,
): { incident: Incident; diagnosis: Diagnosis } {
  const now = new Date().toISOString();
  const incident: Incident = {
    id: item.diagnosisRef,
    service: item.service,
    state: 'diagnosed',
    signalIds: [...context.signals],
    openedAt: now,
    updatedAt: now,
  };
  const diagnosis: Diagnosis = {
    id: `dia-${item.diagnosisRef}`,
    incidentId: incident.id,
    rootCause: wrapUntrusted('root_cause', item.description || item.title),
    evidence: [
      { ref: item.diagnosisRef, excerpt: wrapUntrusted('title', item.title) },
      ...(note === undefined
        ? []
        : [{ ref: 'fix-now-note', excerpt: wrapUntrusted('fix_now_note', note) }]),
    ],
    confidence: context.confidence,
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
  readonly failure: FixFailureCode;
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
      return {
        item,
        trigger: 'auto_fix',
        effect: 'deny',
        ok: false,
        reason: 'auto_fix_disabled',
        failure: 'auto_fix_disabled',
      };
    }
    return this.run(item, 'auto_fix', note);
  }

  async fixNow(item: WorkItem, note?: string): Promise<FixResult> {
    return this.run(item, 'fix_now', note);
  }

  private async run(item: WorkItem, trigger: FixTrigger, note?: string): Promise<FixResult> {
    const { policy, repo, gateway, client, context, agent, envMode } = this.deps;
    const next = trigger === 'fix_now' ? promoteToFront(item) : item;
    const blocked = (effect: Effect, reason: string, failure: FixFailureCode): FixResult => ({
      item: next,
      trigger,
      effect,
      ok: false,
      reason,
      failure,
    });

    const loaded = await context.load(item);
    if (!loaded.ok) return blocked('deny', loaded.reason, 'context_unavailable');
    const parsed = FixContextSchema.safeParse(loaded.value);
    if (!parsed.success) return blocked('deny', 'invalid_fix_context', 'invalid_context');
    const { confidence, category, signals, counters } = parsed.data;

    const decision = decide(
      policy,
      {
        service: item.service,
        category,
        signals: [...signals],
        confidence,
        ...(envMode === undefined ? {} : { envMode }),
        counters,
      },
      { name: 'open_pr' },
    );

    if (decision.effect !== 'allow') {
      return blocked(decision.effect, decision.reason, 'policy_denied');
    }

    const generated = await generatePatch({
      gateway,
      agent,
      rules: rulesFrom(repo),
      diagnosis: item.description || item.title,
    });
    if (!generated.ok) {
      return blocked(decision.effect, generated.error.message, 'patch_rejected');
    }

    const { incident, diagnosis } = toIncidentAndDiagnosis(item, parsed.data, note);
    const patch: Patch = generated.patch;
    let pr: PrRef;
    try {
      // openDraftPr runs guardPatch before its first client call.
      const opened = await openDraftPr({
        client,
        repo,
        patch,
        incident,
        diagnosis,
        category,
        dashboardUrl: '',
      });
      pr = {
        repo: opened.repo,
        number: opened.number,
        url: opened.url,
        branch: opened.branch,
        headSha: opened.headSha,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown PR failure';
      return blocked(decision.effect, `pr_failed: ${reason}`, 'pr_failed');
    }
    return {
      item: withDraftPr(next, pr),
      trigger,
      effect: decision.effect,
      ok: true,
      pr,
      failure: 'none',
    };
  }
}
