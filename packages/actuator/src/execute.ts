import { decide, type Policy } from '@graveshift/policy';

import {
  allowedServices,
  type Breaker,
  createBreaker,
  createTokenStore,
  type TokenStore,
} from './guards';
import { MIN_SECRET_LENGTH, verifyHmac } from './sign';
import {
  type Action,
  type ActionRequest,
  ActionRequestSchema,
  type ActuationResult,
  ActuatorError,
  type DockerRestarter,
  type KubeWriter,
  TOKEN_TTL_MS,
} from './types';

export interface ActuatorOptions {
  secret: string;
  policy: Policy;
  docker: DockerRestarter;
  kube: KubeWriter;
  namespace: string;
  now?: () => number;
  tokens?: TokenStore;
  breaker?: Breaker;
}

const policyActionName = (action: Action): string =>
  action.kind === 'scale'
    ? 'scale'
    : action.runtime === 'docker'
      ? 'restart_service'
      : 'rollout_restart';

export function createActuator(options: ActuatorOptions) {
  const { secret, policy, docker, kube, namespace } = options;
  if (secret.length < MIN_SECRET_LENGTH)
    throw new ActuatorError('ACTUATOR_CONFIG', 'HMAC secret is too short');
  const now = options.now ?? Date.now;
  const tokens = options.tokens ?? createTokenStore(now);
  const breaker = options.breaker ?? createBreaker({ page: () => {} });
  const allowed = allowedServices(policy);
  const recent = new Map<string, number[]>();

  const result = (
    status: ActuationResult['status'],
    reason: string,
    request?: ActionRequest,
  ): ActuationResult => ({
    status,
    reason,
    audit: {
      actor: 'actuator',
      type: `actuator.${status}`,
      ...(request ? { incidentId: request.action.incidentId } : {}),
      payload: {
        reason,
        ...(request
          ? {
              actionId: request.action.id,
              service: request.action.service,
              kind: request.action.kind,
              tokenId: request.approval.tokenId,
              approvedBy: request.approval.approvedBy,
            }
          : {}),
      },
    },
  });
  const deny = (reason: string, request?: ActionRequest) => result('denied', reason, request);

  // returns a denial reason, or undefined when the request may run
  function check(request: ActionRequest): string | undefined {
    const { action, approval, context } = request;
    const at = now();
    const issued = Date.parse(approval.issuedAt);
    const expires = Date.parse(approval.expiresAt);
    if (expires - issued > TOKEN_TTL_MS || expires <= issued) return 'ttl_too_long';
    if (at < issued) return 'not_yet_valid';
    if (at >= expires) return 'expired';
    if (approval.actionId !== action.id || approval.incidentId !== action.incidentId)
      return 'approval_mismatch';
    if (!policy.approvers.discordUserIds.includes(approval.approvedBy)) return 'not_an_approver';
    if (breaker.isOpen(action.service)) return 'circuit_open';
    if (!allowed.has(action.service)) return 'target_not_allowlisted';

    const times = (recent.get(action.service) ?? []).filter((t) => t > at - 10 * 60_000);
    const decision = decide(
      policy,
      {
        service: action.service,
        ...(context.category ? { category: context.category } : {}),
        signals: context.signals,
        confidence: context.confidence,
        counters: {
          openPrsLastHour: 0,
          actionsLast10Min: times.length,
          diagnosisLoops: 0,
          llmSpentTodayUsd: 0,
        },
      },
      {
        name: policyActionName(action),
        ...(action.replicas === undefined ? {} : { params: { replicas: action.replicas } }),
      },
    );
    if (decision.effect !== 'require_approval') return `policy_${decision.reason}`;
    const rule = policy.rules.find((r) => r.id === decision.matchedRule);
    if (action.kind === 'scale' && !rule?.params?.replicas) return 'unbounded_scale';
    return undefined;
  }

  async function run(action: Action): Promise<void> {
    if (action.runtime === 'docker') return docker.restart(action.service);
    if (action.kind === 'scale') return kube.scale(namespace, action.service, action.replicas ?? 0);
    return kube.rolloutRestart(namespace, action.service);
  }

  return {
    breaker,
    async execute(raw: unknown): Promise<ActuationResult> {
      const parsed = ActionRequestSchema.safeParse(raw);
      if (!parsed.success) return deny('malformed_request');
      const request = parsed.data;
      if (!verifyHmac(request, secret)) return deny('bad_signature', request);
      const reason = check(request);
      if (reason) return deny(reason, request);
      // consume last so a denied request never burns its token, and before running so a failure cannot be retried with it
      if (!tokens.consume(request.approval.tokenId, Date.parse(request.approval.expiresAt)))
        return deny('replay', request);
      try {
        await run(request.action);
      } catch (error) {
        return result(
          'failed',
          error instanceof Error ? error.message : 'execution failed',
          request,
        );
      }
      const at = now();
      recent.set(request.action.service, [...(recent.get(request.action.service) ?? []), at]);
      breaker.recordAction(request.action.service, at);
      return result('executed', 'executed', request);
    },
  };
}
