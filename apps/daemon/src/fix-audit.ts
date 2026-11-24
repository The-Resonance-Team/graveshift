import type { AuditDraft, WorkItem } from '@graveshift/core';
import type { SharedPolicyContext } from '@graveshift/core/policy-context';
import { type PolicyAction, type PolicyDecision, toAuditEvent } from '@graveshift/policy';
import type { FixAttempt, PublicationIntent, WorkCaller } from '@graveshift/work';

import type { AuditScope } from './audit';

/**
 * The audit event for one policy call. `toAuditEvent` owns its payload fields: effect, mode,
 * matched rule id, reason codes, warnings, action name and service. Those are codes and
 * policy-config text, so they are safe: `decide()` builds them from the rule set, never from a
 * note or model output.
 */
export const POLICY_DECISION_AUDIT_TYPE = 'policy.decision';

/**
 * The audit event written before the draft pull request call. `WriteAudit` runs first, so a
 * sink failure stops the Fix before any GitHub call. The matching `fix.outcome` event, written
 * by the API after the attempt returns, closes the record.
 */
export const FIX_PR_INTENT_AUDIT_TYPE = 'fix.pr_intent';

/**
 * What a Fix audit entry identifies. It comes from the authenticated scope of the command that
 * started the attempt plus the attempt's own identifiers. A note, a title, a description,
 * model output, a branch slug, a URL and a secret never enter this shape.
 */
export interface FixAuditIdentity {
  /** The authenticated caller's Project: the chain every entry of this attempt belongs to. */
  readonly projectId: string;
  /** The authenticated client id that asked for the Fix. */
  readonly actor: string;
  readonly workItemId: string;
  readonly attemptId: string;
  /** Bumped by every claim of the attempt, so a re-run writes its own decision entry. */
  readonly attemptVersion: number;
  readonly trigger: FixAttempt['trigger'];
  readonly agent: string;
  readonly service: string;
  readonly incidentId?: string;
}

/** The identifiers of one attempt under one authenticated scope. */
export function fixAuditIdentity(
  scope: AuditScope,
  item: WorkItem,
  attempt: FixAttempt,
  incidentId?: string,
): FixAuditIdentity {
  return {
    projectId: scope.projectId,
    actor: scope.actor,
    workItemId: item.id,
    attemptId: attempt.id,
    attemptVersion: attempt.version,
    trigger: attempt.trigger,
    agent: attempt.agent,
    service: item.service,
    ...(incidentId === undefined ? {} : { incidentId }),
  };
}

const identityPayload = (identity: FixAuditIdentity) => ({
  workItemId: identity.workItemId,
  attemptId: identity.attemptId,
  trigger: identity.trigger,
  agent: identity.agent,
  service: identity.service,
});

// The draft carries only the fields the published `AuditDraftSchema` allows. The chain's
// Project comes from the scope passed beside the draft, never from the draft itself.
const scopeOf = (identity: FixAuditIdentity) => ({
  actor: identity.actor,
  ...(identity.incidentId === undefined ? {} : { incidentId: identity.incidentId }),
});

/**
 * The one audit event for the policy call of an attempt. It is written before the gate decides,
 * so a denial is recorded beside the same key the allow path reports. `actor` stays `policy`,
 * the one actor the published MCP audit contract accepts for a decision.
 */
export function policyDecisionAudit(
  decision: PolicyDecision,
  context: SharedPolicyContext,
  action: PolicyAction,
  identity: FixAuditIdentity,
): AuditDraft {
  const event = toAuditEvent(decision, context, action);
  return {
    ...scopeOf(identity),
    actor: event.actor,
    type: POLICY_DECISION_AUDIT_TYPE,
    key: `fix:${identity.attemptId}:policy:${identity.attemptVersion}:${decision.effect}`,
    payload: { ...event.payload, ...identityPayload(identity), stage: 'policy' },
  };
}

/**
 * The audit event written before the draft pull request call. It holds the attempt identifiers
 * and the publication target the patch was verified against, and no pull request data: nothing
 * exists yet. A branch slug stays out because it is built from a title. The append runs before
 * any GitHub call, so a sink failure stops the Fix with no outside side effect.
 */
export function fixPrIntentAudit(
  identity: FixAuditIdentity,
  intent: PublicationIntent,
): AuditDraft {
  return {
    ...scopeOf(identity),
    type: FIX_PR_INTENT_AUDIT_TYPE,
    key: `fix:${identity.attemptId}:pr_intent`,
    payload: {
      ...identityPayload(identity),
      stage: 'draft_pr',
      repo: intent.repo,
      baseSha: intent.baseSha,
    },
  };
}

/** The authenticated scope of a Work command, as used for every audit write of its attempt. */
export function auditScopeOfCaller(caller: WorkCaller): AuditScope {
  return { projectId: caller.projectId, actor: caller.actor };
}
