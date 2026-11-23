import type { EventEnvelope } from '@graveshift/core';

import { type Detection, type RuleId, type Severity, WINDOWS } from './types';

const RULE_SEVERITY: Record<RuleId, Severity> = {
  'log.error-burst': 'warning',
  'runtime.restart-loop': 'critical',
  'runtime.oom': 'critical',
  'runtime.unhealthy': 'critical',
  'metric.5xx-rate': 'critical',
  'metric.p95-latency': 'warning',
  'k8s.image-pull': 'critical',
  'http.error': 'critical',
};

interface GraveState {
  errors: number[];
  restarts: number[];
  failedChecks: number;
  above5xxSince: number | undefined;
}

const inWindow = (times: number[], at: number, windowMs: number): number[] =>
  times.filter((time) => time > at - windowMs && time <= at);

const sampleValue = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

/** Private temporal rules consume observation envelopes, never crew output events. */
// ponytail: temporal samples use ordered observation time per Grave, upgrade if out of order ingestion is required.
export function createRules() {
  const states = new Map<string, GraveState>();
  const observed = new Set<string>();
  const stateOf = (envelope: EventEnvelope): GraveState => {
    const key = JSON.stringify([envelope.projectId, envelope.service]);
    let state = states.get(key);
    if (!state) {
      state = { errors: [], restarts: [], failedChecks: 0, above5xxSince: undefined };
      states.set(key, state);
    }
    return state;
  };

  return (envelope: EventEnvelope): Detection[] => {
    const { type, service, observedAt, payload } = envelope;
    if (
      ![
        'runtime.oom',
        'runtime.crash_loop',
        'runtime.restart',
        'runtime.image_pull_backoff',
        'runtime.unhealthy',
        'health.check',
        'log.line',
        'metric.sample',
        'http.error',
      ].includes(type)
    )
      return [];
    const identity = JSON.stringify([envelope.projectId, envelope.id]);
    if (observed.has(identity)) return [];
    // ponytail: replay identity is bounded to 10000 observations, upgrade if replay exceeds this horizon.
    if (observed.size >= 10_000) observed.delete(observed.values().next().value!);
    observed.add(identity);
    const at = Date.parse(observedAt);
    const state = stateOf(envelope);
    const detect = (rule: RuleId, message: string): Detection => ({
      id: `${envelope.id}:${rule}`,
      projectId: envelope.projectId,
      eventId: envelope.id,
      traceId: envelope.traceId,
      rule,
      service,
      severity: RULE_SEVERITY[rule],
      fingerprint: `${service}:${rule}`,
      message,
      observedAt,
    });
    const message = typeof payload.message === 'string' ? payload.message : type;
    const failedCheck = () => {
      state.failedChecks += 1;
      return state.failedChecks >= WINDOWS.failedChecks
        ? [detect('runtime.unhealthy', `${state.failedChecks} consecutive failed health checks`)]
        : [];
    };
    switch (type) {
      case 'runtime.oom':
        return [detect('runtime.oom', message)];
      case 'runtime.image_pull_backoff':
        return [detect('k8s.image-pull', message)];
      case 'runtime.crash_loop':
        return [detect('runtime.restart-loop', message)];
      case 'runtime.restart':
        state.restarts = [...inWindow(state.restarts, at, WINDOWS.restartLoopMs), at];
        return state.restarts.length >= WINDOWS.restartLoopCount
          ? [detect('runtime.restart-loop', `${state.restarts.length} restarts in 5 min`)]
          : [];
      case 'runtime.unhealthy':
        return failedCheck();
      case 'health.check':
        if (typeof payload.ok !== 'boolean') return [];
        if (!payload.ok) return failedCheck();
        state.failedChecks = 0;
        return [];
      case 'log.line':
        if (
          typeof payload.line !== 'string' ||
          !/\b(error|fatal|panic|exception)\b/i.test(payload.line)
        )
          return [];
        state.errors = [...inWindow(state.errors, at, WINDOWS.errorBurstMs), at];
        return state.errors.length >= WINDOWS.errorBurstCount
          ? [detect('log.error-burst', `${state.errors.length} error lines in 60 s`)]
          : [];
      case 'http.error':
        return envelope.severity === 'info' ? [] : [detect('http.error', message)];
      case 'metric.sample': {
        const { errorRate5xx: rate, p95LatencySeconds: p95 } = payload;
        if (!sampleValue(rate) || !sampleValue(p95)) return [];
        const found: Detection[] = [];
        if (rate !== null && rate > WINDOWS.rate5xxThreshold) {
          state.above5xxSince ??= at;
          if (at - state.above5xxSince >= WINDOWS.rate5xxForMs) {
            found.push(detect('metric.5xx-rate', `5xx rate ${(rate * 100).toFixed(1)}% for 1 min`));
          }
        } else {
          state.above5xxSince = undefined;
        }
        if (p95 !== null && p95 > WINDOWS.p95ThresholdSeconds) {
          found.push(detect('metric.p95-latency', `p95 latency ${p95.toFixed(2)} s`));
        }
        return found;
      }
      default:
        return [];
    }
  };
}
