import type { EventEnvelope } from '@graveshift/core';

import type { RuleId, WatcherOutcome } from './types';
import { createWatcher, type WatcherOptions } from './watcher';

export const T0 = Date.parse('2026-11-20T10:00:00.000Z');
export const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

export function harness(options: WatcherOptions = {}) {
  const outcomes: WatcherOutcome[] = [];
  let count = 0;
  const watcher = createWatcher({
    ...options,
    onOutcome: (outcome) => {
      outcomes.push(outcome);
    },
    newId: () => `inc-${++count}`,
  });
  const accepted = (rule?: RuleId) =>
    outcomes.filter(
      (outcome) => outcome.status === 'accepted' && (!rule || outcome.detection.rule === rule),
    );
  return { watcher, outcomes, accepted };
}

export function observation(
  type: string,
  seconds: number,
  payload: Record<string, unknown> = {},
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    id: `event:${type}:${seconds}`,
    projectId: 'project-1',
    service: 'api',
    source: 'collector.test',
    type,
    severity: 'warning',
    observedAt: at(seconds),
    traceId: 'trace-1',
    fingerprint: `api:${type}`,
    payload,
    ...overrides,
  };
}

export const signal = (kind: string, seconds: number, service = 'api', projectId = 'project-1') =>
  observation(
    `runtime.${kind}`,
    seconds,
    { message: kind },
    { id: `${projectId}:${service}:${kind}:${seconds}`, service, projectId },
  );
export const log = (seconds: number, line = 'ERROR boom') =>
  observation('log.line', seconds, { line }, { severity: 'info' });
export const health = (seconds: number, ok: boolean) =>
  observation('health.check', seconds, { ok }, { severity: 'info' });
export const metric = (
  seconds: number,
  errorRate5xx: number | null,
  p95LatencySeconds: number | null = null,
) =>
  observation('metric.sample', seconds, { errorRate5xx, p95LatencySeconds }, { severity: 'info' });
