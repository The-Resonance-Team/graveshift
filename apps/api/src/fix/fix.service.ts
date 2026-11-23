import { wrapUntrusted } from '@graveshift/agents/untrusted';
import { renderFixPrompt } from '@graveshift/config';
import {
  type Diagnosis,
  type Incident,
  promoteToFront,
  type WorkItem,
  withDraftPr,
} from '@graveshift/core';
import {
  type Patch,
  type PrRef,
  RepoNotAllowedError,
  openDraftPr,
  StaleBaseError,
} from '@graveshift/fixer';
import { generatePatch, type RepoRules } from '@graveshift/patch';
import { redact } from '@graveshift/redactor';
import { decide, type Effect } from '@graveshift/policy';
import { Inject, Injectable } from '@nestjs/common';

import type { FixNowRequestDto } from '../work-items/dto/fix-now-request.dto';
import {
  type FixContext,
  FixContextSchema,
  FIX_DEPS,
  type FixDeps,
  type FixFailureCode,
} from './fix.types';

// Every value below is request data. Wrapping keeps tags and secrets out of the
// title, the commit subject and the branch slug, which use clean redacted text.
function toIncidentAndDiagnosis(
  item: WorkItem,
  context: FixContext,
  note?: string,
): { incident: Incident; diagnosis: Diagnosis } {
  const now = new Date().toISOString();
  // The work item id leads so branchRef's short id stays distinct when a diagnosis ref is shared.
  const incidentId = `${item.id}-${item.diagnosisRef}`;
  const incident: Incident = {
    id: incidentId,
    service: item.service,
    state: 'diagnosed',
    signalIds: [...context.signals],
    openedAt: now,
    updatedAt: now,
  };
  const diagnosis: Diagnosis = {
    id: `dia-${incidentId}`,
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

function systemFrom(deps: FixDeps, repo: FixDeps['repo'], diagnosis: string): string {
  const rules = rulesFrom(repo);
  return renderFixPrompt(deps.promptTemplate, {
    AGENT_NAME: deps.agentMeta.name,
    AGENT_ROLE: deps.agentMeta.role,
    AGENT_DESCRIPTION: deps.agentMeta.description,
    AGENT_PROMPT: deps.agentMeta.prompt,
    MODEL: deps.agentMeta.model,
    PROVIDER: deps.agentMeta.provider,
    DAILY_BUDGET_USD: deps.agentMeta.dailyBudgetUsd,
    DIAGNOSIS: wrapUntrusted('diagnosis', diagnosis),
    RULES: [
      `maxFilesChanged=${rules.maxFilesChanged}`,
      `maxLinesChanged=${rules.maxLinesChanged}`,
      `allowedPaths=${JSON.stringify(rules.allowedPaths)}`,
      `forbiddenPaths=${JSON.stringify(rules.forbiddenPaths)}`,
    ].join('\n'),
  });
}

// Both triggers enter here. The policy gate runs before the patch call and before
// any GitHub client call. Model output never grants permission.
@Injectable()
export class FixService {
  constructor(@Inject(FIX_DEPS) private readonly deps: FixDeps) {}

  async autoFix(item: WorkItem, note?: string): Promise<FixResult> {
    if (!this.deps.autoFixEnabled) {
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

  async fixNow(item: WorkItem, request: FixNowRequestDto = {}): Promise<FixResult> {
    return this.run(item, 'fix_now', request.note);
  }

  private async run(item: WorkItem, trigger: FixTrigger, note?: string): Promise<FixResult> {
    const { policy, repo, gateway, client, context, agent, envMode } = this.deps;
    const blocked = (effect: Effect, reason: string, failure: FixFailureCode): FixResult => ({
      item,
      trigger,
      effect,
      ok: false,
      reason,
      failure,
    });

    if (item.draftPr !== null) return blocked('deny', 'already_fixed', 'already_fixed');

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

    // The policy gate also rejects a service the config never maps for this
    // repository, before any source read, model call or GitHub call. Today the
    // client raises it only when the pull request is opened.
    if (!repo.services.includes(item.service)) {
      return blocked(
        decision.effect,
        `repo_not_allowed: no mapping for service ${item.service}`,
        'policy_denied',
      );
    }

    // The model's view of the problem. A Fix now note is a human hint for it and
    // is wrapped as untrusted data with the rest; it never reaches the body.
    const problem = item.description || item.title;
    const diagnosisText = note === undefined ? problem : `${problem}\n\nFix now note: ${note}`;

    // Read the real repository at the base ref. Everything the model may use
    // comes from this snapshot: it never reaches for source itself.
    let base;
    try {
      base = await this.deps.source.readBase(repo.repo, repo.baseBranch);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown source failure';
      return blocked(
        decision.effect,
        `source_unavailable: ${redact(reason)}`,
        'source_unavailable',
      );
    }

    const generated = await generatePatch({
      gateway,
      agent,
      system: systemFrom(this.deps, repo, diagnosisText),
      rules: rulesFrom(repo),
      diagnosis: diagnosisText,
      base: { baseSha: base.baseSha, files: base.files },
    });
    if (!generated.ok) {
      return blocked(decision.effect, generated.error.message, 'patch_rejected');
    }

    // The patch runs in a throwaway checkout with no secrets and no network
    // before anything is pushed. A failed or timed-out check blocks the PR.
    const verified = await this.deps.workspace.verify(base, generated.patch, this.deps.sandbox);
    if (!verified.ok) {
      return blocked(decision.effect, `checks_failed: ${redact(verified.reason)}`, 'checks_failed');
    }

    const { incident, diagnosis } = toIncidentAndDiagnosis(item, parsed.data, note);
    // Titles, subjects and slugs use clean redacted text. The body carries
    // identifiers, check results and diff stats only.
    const headline = redact(item.description || item.title)
      .replace(/\s+/g, ' ')
      .trim();
    const patch: Patch = generated.patch;
    let pr: PrRef;
    try {
      // openDraftPr runs guardPatch and the stale-base re-check before its
      // first mutating client call.
      const opened = await openDraftPr({
        client,
        repo,
        patch,
        base: { sha: base.baseSha, treeSha: base.treeSha },
        checks: verified.checks,
        diff: generated.summary,
        incident,
        diagnosis,
        category,
        dashboardUrl: '',
        headline,
        now: this.deps.now,
      });
      pr = opened;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown PR failure';
      if (error instanceof StaleBaseError) {
        return blocked(decision.effect, redact(reason), 'stale_base');
      }
      if (error instanceof RepoNotAllowedError) {
        return blocked('deny', redact(reason), 'policy_denied');
      }
      return blocked(decision.effect, `pr_failed: ${redact(reason)}`, 'pr_failed');
    }
    // Fix now promotes the queue only after a successful fix.
    const next = trigger === 'fix_now' ? promoteToFront(item) : item;
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
