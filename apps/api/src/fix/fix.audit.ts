import type { FixResult, FixTrigger, TriageResult, WorkCaller } from '@graveshift/work';
import { ForbiddenException } from '@nestjs/common';

import { isAuditScopeUsable, type AuditRecord, type AuditScope } from '../audit/audit.sink';

/**
 * The one audit event that records how a Fix attempt ended. It is written after the daemon
 * ran the attempt, so after any GitHub call, and never before it: the pre-side-effect intent
 * event is the daemon's `fix.pr_intent`, written before the draft pull request call.
 */
export const FIX_OUTCOME_AUDIT_TYPE = 'fix.outcome';

/** The denial a Fix route returns when the request carries no authenticated audit scope. */
export const NO_AUDIT_SCOPE_MESSAGE = 'The request has no authenticated audit scope';

/** The identity a Fix audit entry may record. Everything else about a request stays out. */
export interface FixAuditOutcome {
  readonly workItemId: string;
  readonly trigger: FixTrigger;
  readonly attemptId: string | null;
  readonly effect: FixResult['effect'];
  readonly ok: boolean;
  /** The fixed failure code from the contract. A reason string is free text and never copied. */
  readonly failure: FixResult['failure'];
  /** The draft pull request identity. A body, a branch slug, a URL and a title stay out. */
  readonly pr?: { readonly repo: string; readonly number: number; readonly headSha: string };
}

/**
 * The audit scope of a Fix command. Both fields come from the verified OAuth principal the
 * route guard put on the request, never from the body, and `bound` is the scope
 * `AuditScopeInterceptor` bound for the request. A command whose caller does not match the
 * bound scope, or that runs outside one, has no chain to write to: it is denied before any
 * store read, daemon call, model call or GitHub call rather than failing open into another
 * Project's chain.
 */
export function requireFixAuditScope(
  caller: WorkCaller,
  bound: AuditScope | undefined,
): AuditScope {
  const scope: AuditScope = { projectId: caller.projectId, actor: caller.actor };
  if (!isAuditScopeUsable(scope) || !isAuditScopeUsable(bound)) {
    throw new ForbiddenException(NO_AUDIT_SCOPE_MESSAGE);
  }
  if (bound.projectId !== scope.projectId || bound.actor !== scope.actor) {
    throw new ForbiddenException(NO_AUDIT_SCOPE_MESSAGE);
  }
  return scope;
}

function outcomeRecord(scope: AuditScope, outcome: FixAuditOutcome): AuditRecord {
  return {
    projectId: scope.projectId,
    actor: scope.actor,
    type: FIX_OUTCOME_AUDIT_TYPE,
    // One entry per attempt. A replayed command that returns the recorded result appends the
    // same key, and `AuditRepo.append` keeps one entry for one key.
    key: `fix:${outcome.attemptId ?? outcome.workItemId}:${outcome.trigger}:outcome`,
    payload: {
      workItemId: outcome.workItemId,
      ...(outcome.attemptId === null ? {} : { attemptId: outcome.attemptId }),
      trigger: outcome.trigger,
      effect: outcome.effect,
      ok: outcome.ok,
      failure: outcome.failure,
      ...(outcome.pr === undefined
        ? {}
        : {
            pr: {
              repo: outcome.pr.repo,
              number: outcome.pr.number,
              headSha: outcome.pr.headSha,
            },
          }),
    },
  };
}

/** The outcome fields a Fix command reports back from the daemon. */
export function fixOutcomeFromCommand(id: string, result: FixResult): FixAuditOutcome {
  return {
    workItemId: id,
    trigger: result.trigger,
    attemptId: result.attemptId,
    effect: result.effect,
    ok: result.ok,
    failure: result.failure,
    ...(result.pr === null
      ? {}
      : {
          pr: {
            repo: result.pr.repo,
            number: result.pr.number,
            headSha: result.pr.headSha,
          },
        }),
  };
}

/**
 * The outcome of the automatic attempt a triage started. It carries no pull request: the public
 * triage reply reports the attempt's terminal state only, and the pull request identity stays
 * with the Fix result.
 */
export function fixOutcomeFromTriage(id: string, result: TriageResult): FixAuditOutcome {
  const auto = result.autoFix;
  if (auto === null) throw new Error('A triage with no Fix attempt has no outcome to audit');
  return {
    workItemId: id,
    trigger: 'auto_fix',
    attemptId: auto.attemptId,
    effect: auto.effect,
    ok: auto.ok,
    failure: auto.failure,
  };
}

/**
 * The one audit event for one Fix attempt. A note, a title, a description, a free-text reason,
 * model output and a secret never enter this shape: the payload holds identifiers and the
 * contract's failure code only.
 */
export function fixOutcomeAudit(scope: AuditScope, outcome: FixAuditOutcome): AuditRecord {
  return outcomeRecord(scope, outcome);
}
