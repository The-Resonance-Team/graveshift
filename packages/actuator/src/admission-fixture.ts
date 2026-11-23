import type { Policy } from '@graveshift/policy';

import * as claims from './claims';
import type { RequiredAudit, RuntimeOutcome } from './types';

interface ClaimRecord {
  input: claims.RuntimeClaim;
  at: number;
  result?: RuntimeOutcome;
}

export function createAdmissionFixture(policy: Policy, now: () => number, audit: RequiredAudit) {
  const records = new Map<string, ClaimRecord>();
  const calls: Array<claims.RuntimeClaim | claims.RuntimeCompletion> = [];
  let queue = Promise.resolve();
  const change = <Result>(task: () => Promise<Result>): Promise<Result> => {
    const pending = queue.then(task);
    queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  };
  const admission: claims.RequiredAdmission = {
    claim: (input) =>
      change(async () => {
        calls.push(structuredClone(input));
        const { request, requestHash } = input;
        const prior = [...records.values()].find(
          (entry) =>
            entry.input.request.approval.tokenId === request.approval.tokenId ||
            entry.input.request.action.id === request.action.id,
        );
        if (prior) {
          if (prior.input.requestHash !== requestHash) return { kind: 'uncertain' };
          return prior.result ? { kind: 'known', result: prior.result } : { kind: 'uncertain' };
        }
        const count = [...records.values()].filter(
          (entry) =>
            entry.input.request.action.service === request.action.service &&
            (entry.result === undefined || entry.at > now() - 600_000),
        ).length;
        const reason =
          claims.approvalReason(request, policy, now()) ??
          claims.runtimeDecision(policy, request, count);
        if (reason) return { kind: 'denied', reason };
        const draft = claims.claimAudit(input);
        const ack = await audit(structuredClone(draft));
        if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
        records.set(request.approval.tokenId, { input: structuredClone(input), at: now() });
        return { kind: 'claimed' };
      }),
    complete: (input) =>
      change(async () => {
        calls.push(structuredClone(input));
        const prior = records.get(input.tokenId);
        if (!prior || prior.input.requestHash !== input.requestHash) return { kind: 'uncertain' };
        if (prior.result) return { kind: 'known', result: prior.result };
        const { service, incidentId } = prior.input.request.action;
        const draft = claims.completionAudit(input, service, incidentId);
        const ack = await audit(structuredClone(draft));
        if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
        prior.result = structuredClone(input.result);
        return { kind: 'completed' };
      }),
  };
  return { admission, records, calls };
}
