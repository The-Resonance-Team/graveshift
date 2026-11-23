import { BREAKER_WINDOW_MS } from '@graveshift/core';

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
