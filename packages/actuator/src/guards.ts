import { BREAKER_WINDOW_MS } from '@graveshift/core';

import type { Policy } from '@graveshift/policy';

// ponytail: consumed ids live in memory, so a restart inside the 15 min TTL reopens replay, upgrade by persisting them if the actuator restarts that often
export function createTokenStore(now: () => number = Date.now) {
  const used = new Map<string, number>();
  return {
    consume(tokenId: string, expiresAtMs: number): boolean {
      for (const [id, expiry] of used) if (expiry <= now()) used.delete(id);
      if (used.has(tokenId)) return false;
      used.set(tokenId, expiresAtMs);
      return true;
    },
  };
}
export type TokenStore = ReturnType<typeof createTokenStore>;

export interface BreakerOptions {
  page: (service: string, reason: string) => void;
}

export function createBreaker({ page }: BreakerOptions) {
  const lastAction = new Map<string, number>();
  const open = new Set<string>();
  return {
    recordAction(service: string, atMs: number): void {
      lastAction.set(service, atMs);
    },
    // SEC-11: a reopen within 10 min of our own action disables auto-actions for that service and pages humans
    reopened(service: string, atMs: number): boolean {
      const last = lastAction.get(service);
      if (last === undefined || atMs - last >= BREAKER_WINDOW_MS) return false;
      if (!open.has(service)) {
        open.add(service);
        page(
          service,
          `incident reopened ${Math.round((atMs - last) / 1000)} s after a Graveshift action`,
        );
      }
      return true;
    },
    isOpen: (service: string): boolean => open.has(service),
    reset: (service: string): void => void open.delete(service),
  };
}
export type Breaker = ReturnType<typeof createBreaker>;

// services the policy names on a non-deny, non-PR rule; wildcard rules grant nothing
export function allowedServices(policy: Policy): Set<string> {
  const allowed = new Set<string>();
  for (const rule of policy.rules) {
    if (rule.effect === 'deny') continue;
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    if (actions.every((a) => a === 'open_pr')) continue;
    for (const service of rule.when?.services ?? []) allowed.add(service);
  }
  return allowed;
}
