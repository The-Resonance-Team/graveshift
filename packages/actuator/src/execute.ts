import * as core from '@graveshift/core';

import { actionAudit } from './audit';
import * as claims from './claims';
import * as guards from './guards';
import { MIN_SECRET_LENGTH, verifyHmac } from './sign';
import * as types from './types';

export interface ActuatorOptions {
  secret: string;
  docker: types.DockerRestarter;
  kube: types.KubeWriter;
  namespace: string;
  requiredAudit: types.RequiredAudit;
  durableAdmission: claims.RequiredAdmission;
  /** False when the audit sink acknowledges but does not persist a record. */
  durableAudit?: boolean;
  breaker?: guards.Breaker;
}

export function createActuator(options: ActuatorOptions) {
  const { secret, docker, kube, namespace, requiredAudit, durableAdmission } = options;
  const durableAudit = options.durableAudit ?? true;
  if (secret.length < MIN_SECRET_LENGTH)
    throw new types.ActuatorError('ACTUATOR_CONFIG', 'HMAC secret is too short');
  if (typeof requiredAudit !== 'function')
    throw new types.ActuatorError('ACTUATOR_CONFIG', 'Required audit sink is missing');
  if (
    typeof durableAdmission?.claim !== 'function' ||
    typeof durableAdmission.complete !== 'function'
  )
    throw new types.ActuatorError('ACTUATOR_CONFIG', 'Durable runtime admission is required');
  const breaker = options.breaker ?? guards.createBreaker({ page: () => {} });

  async function acknowledge(draft: core.AuditDraft): Promise<boolean> {
    try {
      const ack = await requiredAudit(structuredClone(draft));
      return durableAudit && ack?.key === draft.key;
    } catch {
      return false;
    }
  }

  async function terminal(
    status: types.ActuationResult['status'],
    reason: string,
    request?: types.ActionRequest,
    keyBase?: string,
  ): Promise<types.ActuationResult> {
    const audit = actionAudit(status, reason, request, keyBase);
    const acknowledged = await acknowledge(audit);
    return { status, reason, audit, auditStatus: acknowledged ? 'acknowledged' : 'pending' };
  }

  async function run(action: types.Action): Promise<void> {
    if (action.runtime === 'docker') return docker.restart(action.service);
    if (action.kind === 'scale') return kube.scale(namespace, action.service, action.replicas ?? 0);
    return kube.rolloutRestart(namespace, action.service);
  }

  async function complete(
    request: types.ActionRequest,
    result: types.RuntimeOutcome,
  ): Promise<types.ActuationResult> {
    const completion: claims.RuntimeCompletion = {
      tokenId: request.approval.tokenId,
      actionId: request.action.id,
      requestHash: claims.requestHash(request),
      result,
    };
    const audit = claims.completionAudit(
      completion,
      request.action.service,
      request.action.incidentId,
    );
    try {
      const ack = await durableAdmission.complete(structuredClone(completion));
      if (
        ack.kind === 'completed' ||
        (ack.kind === 'known' &&
          ack.result.status === result.status &&
          ack.result.reason === result.reason)
      ) {
        return { ...result, audit, auditStatus: durableAudit ? 'acknowledged' : 'pending' };
      }
    } catch {
      // The known runtime result is retained. An unfinished durable claim blocks another effect.
    }
    return { ...result, audit, auditStatus: 'pending' };
  }

  return {
    breaker,
    async execute(raw: unknown): Promise<types.ActuationResult> {
      const parsed = types.ActionRequestSchema.safeParse(raw);
      if (!parsed.success) return terminal('denied', 'malformed_request');
      const request = parsed.data;
      if (!verifyHmac(request, secret)) return terminal('denied', 'bad_signature');
      const input = claims.runtimeClaim(request);
      let claimed: claims.ClaimResult;
      try {
        claimed = await durableAdmission.claim(structuredClone(input));
      } catch {
        return {
          status: 'failed',
          reason: 'admission_unavailable',
          audit: claims.claimAudit(input),
          auditStatus: 'pending',
        };
      }
      if (claimed.kind !== 'claimed') {
        const reason =
          claimed.kind === 'known'
            ? 'already_completed'
            : claimed.kind === 'uncertain'
              ? 'execution_uncertain'
              : claimed.reason;
        const result = await terminal('denied', reason, request);
        return claimed.kind === 'known' ? { ...result, knownResult: claimed.result } : result;
      }
      const late = await durableAdmission.recheck(input);
      if (late) return complete(request, { status: 'denied', reason: late });
      breaker.recordAction(request.action.service);
      let status: 'executed' | 'failed' = 'executed';
      try {
        await run(request.action);
      } catch {
        status = 'failed';
      }
      return complete(
        request,
        status === 'executed'
          ? { status, reason: 'executed' }
          : { status, reason: 'execution_failed' },
      );
    },
  };
}

export type Actuator = ReturnType<typeof createActuator>;
