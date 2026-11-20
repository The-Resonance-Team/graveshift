import type { RuntimeEvent } from '@graveshift/core';

import { type Detection, type RuleId, type Severity, WINDOWS } from './types';

export const RULE_SEVERITY: Record<RuleId, Severity> = {
  'log.error-burst': 'warning',
  'runtime.restart-loop': 'critical',
  'runtime.oom': 'critical',
  'runtime.unhealthy': 'critical',
  'metric.5xx-rate': 'critical',
  'metric.p95-latency': 'warning',
  'k8s.image-pull': 'critical',
};

export const fingerprint = (service: string, rule: RuleId): string => `${service}:${rule}`;

export const isErrorLine = (line: string): boolean =>
  /\b(error|fatal|panic|exception)\b/i.test(line);

interface ServiceState {
  errors: number[];
  restarts: number[];
  failedChecks: number;
  above5xxSince: number | undefined;
}

const inWindow = (times: number[], at: number, windowMs: number): number[] =>
  times.filter((t) => t > at - windowMs && t <= at);

// ponytail: assumes event time is non-decreasing per service, upgrade if sources replay out of order
export function createRules() {
  const states = new Map<string, ServiceState>();
  const stateOf = (service: string): ServiceState => {
    let state = states.get(service);
    if (!state) {
      state = { errors: [], restarts: [], failedChecks: 0, above5xxSince: undefined };
      states.set(service, state);
    }
    return state;
  };

  const detect = (rule: RuleId, service: string, at: number, message: string): Detection => ({
    id: `${rule}:${service}:${at}`,
    rule,
    service,
    severity: RULE_SEVERITY[rule],
    fingerprint: fingerprint(service, rule),
    message,
    observedAt: new Date(at).toISOString(),
  });

  const failedCheck = (service: string, at: number): Detection[] => {
    const state = stateOf(service);
    state.failedChecks += 1;
    return state.failedChecks >= WINDOWS.failedChecks
      ? [
          detect(
            'runtime.unhealthy',
            service,
            at,
            `${state.failedChecks} consecutive failed health checks`,
          ),
        ]
      : [];
  };

  return {
    runtimeEvent(event: RuntimeEvent): Detection[] {
      if (event.kind !== 'signal') return [];
      const { service, kind, message, observedAt } = event.signal;
      const at = Date.parse(observedAt);
      const state = stateOf(service);
      switch (kind) {
        case 'oom':
          return [detect('runtime.oom', service, at, message)];
        case 'image_pull_backoff':
          return [detect('k8s.image-pull', service, at, message)];
        case 'crash_loop':
          return [detect('runtime.restart-loop', service, at, message)];
        case 'restart': {
          state.restarts = [...inWindow(state.restarts, at, WINDOWS.restartLoopMs), at];
          return state.restarts.length >= WINDOWS.restartLoopCount
            ? [
                detect(
                  'runtime.restart-loop',
                  service,
                  at,
                  `${state.restarts.length} restarts in 5 min`,
                ),
              ]
            : [];
        }
        case 'unhealthy':
          return failedCheck(service, at);
      }
    },

    healthCheck(service: string, ok: boolean, at: number): Detection[] {
      if (ok) {
        stateOf(service).failedChecks = 0;
        return [];
      }
      return failedCheck(service, at);
    },

    logLine(service: string, line: string, at: number): Detection[] {
      if (!isErrorLine(line)) return [];
      const state = stateOf(service);
      state.errors = [...inWindow(state.errors, at, WINDOWS.errorBurstMs), at];
      return state.errors.length >= WINDOWS.errorBurstCount
        ? [detect('log.error-burst', service, at, `${state.errors.length} error lines in 60 s`)]
        : [];
    },

    metrics(
      service: string,
      sample: { errorRate5xx: number | null; p95LatencySeconds: number | null },
      at: number,
    ): Detection[] {
      const state = stateOf(service);
      const found: Detection[] = [];
      const { errorRate5xx: rate, p95LatencySeconds: p95 } = sample;
      if (rate !== null && rate > WINDOWS.rate5xxThreshold) {
        state.above5xxSince ??= at;
        if (at - state.above5xxSince >= WINDOWS.rate5xxForMs) {
          found.push(
            detect(
              'metric.5xx-rate',
              service,
              at,
              `5xx rate ${(rate * 100).toFixed(1)}% for 1 min`,
            ),
          );
        }
      } else {
        state.above5xxSince = undefined;
      }
      if (p95 !== null && p95 > WINDOWS.p95ThresholdSeconds) {
        found.push(detect('metric.p95-latency', service, at, `p95 latency ${p95.toFixed(2)} s`));
      }
      return found;
    },
  };
}
