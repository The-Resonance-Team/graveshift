import { BREAKER_WINDOW_MS } from '@graveshift/core';
import type { Policy } from '@graveshift/policy';

import * as claims from './claims';
import type { RequiredAudit, RuntimeOutcome } from './types';

interface ClaimRecord {
  input: claims.RuntimeClaim;
  at: number;
  expiresAt: number;
  result?: RuntimeOutcome;
}

export interface AdmissionFixtureOptions {
  envMode?: string;
  maxTrackedActions?: number;
  blocked?: (service: string) => claims.DenyReason | undefined;
}

/** The one in-memory adapter for tests. It owns every admission decision. */
export function createAdmissionFixture(
  policy: Policy,
  now: () => number,
  audit: RequiredAudit,
  options: AdmissionFixtureOptions = {},
) {
  const maxTracked = claims.checkCapacity(options.maxTrackedActions);
  const rules: claims.AdmissionRules = { policy, now, audit, ...options };
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
  const prune = (at: number) => {
    for (const [tokenId, entry] of records) {
      const active = entry.result === undefined || entry.at > at - BREAKER_WINDOW_MS;
      if (!active && entry.expiresAt <= at) records.delete(tokenId);
    }
  };
  const priorFor = (request: claims.RuntimeClaim['request']) =>
    [...records.values()].find(
      (entry) =>
        entry.input.request.approval.tokenId === request.approval.tokenId ||
        entry.input.request.action.id === request.action.id,
    );

  const admission: claims.RequiredAdmission = {
    async claim(input) {
      calls.push(structuredClone(input));
      const { request, requestHash } = input;
      const at = now();
      // Replay wins: a known or pending claim keeps its outcome even if its token has expired.
      const prior = priorFor(request);
      if (prior) {
        if (prior.input.requestHash !== requestHash) return { kind: 'uncertain' };
        return prior.result ? { kind: 'known', result: prior.result } : { kind: 'uncertain' };
      }
      prune(at);
      const invalid = claims.lateEligibilityReason(request, rules);
      if (invalid) return { kind: 'denied', reason: invalid };
      const count = [...records.values()].filter(
        (entry) =>
          entry.input.request.action.service === request.action.service &&
          (entry.result === undefined || entry.at > at - BREAKER_WINDOW_MS),
      ).length;
      const denied = claims.runtimeDecision(policy, request, count, options.envMode);
      if (denied) return { kind: 'denied', reason: denied };
      if (records.size >= maxTracked) return { kind: 'denied', reason: 'admission_capacity' };
      records.set(request.approval.tokenId, {
        input: structuredClone(input),
        at,
        expiresAt: Date.parse(request.approval.expiresAt),
      });
      const draft = claims.claimAudit(input);
      try {
        const ack = await audit(structuredClone(draft));
        if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
        return { kind: 'claimed' };
      } catch (error) {
        // The required audit did not acknowledge: no claim stays reserved.
        records.delete(request.approval.tokenId);
        throw error;
      }
    },
    recheck: async (input) => claims.lateEligibilityReason(input.request, rules),
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
