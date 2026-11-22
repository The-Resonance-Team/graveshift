import * as policyEngine from '@graveshift/policy';
import { z } from 'zod';

import { actionAudit } from './audit';
import { requestHash } from './sign';
import * as types from './types';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const RuntimeClaimSchema = z.strictObject({
  request: types.ActionRequestSchema,
  requestHash: hash,
});
export type RuntimeClaim = z.infer<typeof RuntimeClaimSchema>;
export const RuntimeCompletionSchema = z.strictObject({
  tokenId: z.string().min(1),
  actionId: z.string().min(1),
  requestHash: hash,
  result: types.RuntimeOutcomeSchema,
});
export type RuntimeCompletion = z.infer<typeof RuntimeCompletionSchema>;
export const ClaimResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('claimed') }),
  z.strictObject({ kind: z.literal('known'), result: types.RuntimeOutcomeSchema }),
  z.strictObject({ kind: z.literal('uncertain') }),
  z.strictObject({
    kind: z.literal('denied'),
    reason: z
      .string()
      .regex(/^[a-z_]+$/)
      .max(100),
  }),
]);
export type ClaimResult = z.infer<typeof ClaimResultSchema>;
export const CompletionResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed') }),
  z.strictObject({ kind: z.literal('known'), result: types.RuntimeOutcomeSchema }),
  z.strictObject({ kind: z.literal('uncertain') }),
]);
export type CompletionResult = z.infer<typeof CompletionResultSchema>;
export interface RequiredAdmission {
  claim(input: RuntimeClaim): Promise<ClaimResult>;
  complete(input: RuntimeCompletion): Promise<CompletionResult>;
}

export function runtimeClaim(request: types.ActionRequest): RuntimeClaim {
  return { request, requestHash: requestHash(request) };
}

export function claimAudit(input: RuntimeClaim) {
  return actionAudit('admitted', 'admitted', input.request, input.requestHash);
}

export function completionAudit(input: RuntimeCompletion, service: string, incidentId: string) {
  return {
    key: `actuator:${input.requestHash}:terminal`,
    actor: 'actuator',
    type: `actuator.${input.result.status}`,
    incidentId,
    payload: { ...input.result, actionId: input.actionId, tokenId: input.tokenId, service },
  };
}

export function approvalReason(
  request: types.ActionRequest,
  policy: policyEngine.Policy,
  at: number,
) {
  const { approval, action } = request;
  const issued = Date.parse(approval.issuedAt);
  const expires = Date.parse(approval.expiresAt);
  if (expires - issued > types.TOKEN_TTL_MS || expires <= issued) return 'ttl_too_long';
  if (at < issued) return 'not_yet_valid';
  if (at >= expires) return 'expired';
  if (approval.actionId !== action.id || approval.incidentId !== action.incidentId)
    return 'approval_mismatch';
  if (!policy.approvers.discordUserIds.includes(approval.approvedBy)) return 'not_an_approver';
  return undefined;
}

export function runtimeDecision(
  policy: policyEngine.Policy,
  request: types.ActionRequest,
  actionsLast10Min: number,
  envMode?: string,
) {
  const { action, context } = request;
  const decision = policyEngine.decideRuntime(
    policy,
    {
      service: action.service,
      ...(context.category === undefined ? {} : { category: context.category }),
      confidence: context.confidence,
      signals: context.signals,
      ...(envMode === undefined ? {} : { envMode }),
      counters: { openPrsLastHour: 0, actionsLast10Min, diagnosisLoops: 0, llmSpentTodayUsd: 0 },
    },
    {
      name:
        action.kind === 'scale'
          ? 'scale'
          : action.runtime === 'docker'
            ? 'restart_service'
            : 'rollout_restart',
      ...(action.replicas === undefined ? {} : { params: { replicas: action.replicas } }),
    },
  );
  if (decision.effect === 'require_approval') return undefined;
  return ['target_not_allowlisted', 'unbounded_scale'].includes(decision.reason)
    ? decision.reason
    : `policy_${decision.reason}`;
}

export { requestHash, signRequest } from './sign';
export { RuntimeOutcomeSchema } from './types';
export type { ActionRequest, RuntimeOutcome } from './types';
