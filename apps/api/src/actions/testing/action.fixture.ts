import * as claims from '@graveshift/actuator/claims';
import { parsePolicy } from '@graveshift/policy';

export const ACTION_TEST_TOKEN = 'action-test-only-internal-token-32chars';
export const ACTION_TEST_POLICY = parsePolicy({
  version: 1,
  mode: 'act',
  approvers: { discordUserIds: ['fixture-approver'], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 1,
    maxActionsPerServicePer10Min: 1,
    maxDiagnosisLoops: 2,
    llmDailyBudgetUsd: 2,
  },
  llm: { minConfidenceForPr: 0.6, minConfidenceForAction: 0.75 },
  github: { repos: [] },
  rules: [
    {
      id: 'restart',
      action: ['restart_service', 'rollout_restart'],
      when: { services: ['api', 'worker'] },
      effect: 'require_approval',
    },
  ],
  default: 'deny',
});

export function claimInput(
  at: number,
  tokenId = 'token-1',
  service = 'api',
  actionId = `action-${tokenId}`,
) {
  const request = claims.signRequest(
    {
      action: { id: actionId, incidentId: 'incident-1', service, kind: 'restart', runtime: 'k8s' },
      approval: {
        tokenId,
        actionId,
        incidentId: 'incident-1',
        approvedBy: 'fixture-approver',
        issuedAt: new Date(at - 1_000).toISOString(),
        expiresAt: new Date(at + 899_000).toISOString(),
      },
      context: { signals: ['oom_killed'], confidence: 1 },
    },
    'fixture-signing-secret-32-characters',
  );
  return { projectId: 'project-1', claim: claims.runtimeClaim(request) };
}

export function completionInput(
  input: ReturnType<typeof claimInput>,
  result: claims.RuntimeOutcome = { status: 'executed', reason: 'executed' },
) {
  return {
    projectId: input.projectId,
    completion: {
      tokenId: input.claim.request.approval.tokenId,
      actionId: input.claim.request.action.id,
      requestHash: input.claim.requestHash,
      result,
    },
  };
}
