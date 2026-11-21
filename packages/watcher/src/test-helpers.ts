import type { RuntimeEvent, Signal } from '@graveshift/core';

import type { Outcome, RuleId } from './types';
import { createWatcher } from './watcher';

export const T0 = Date.parse('2026-11-20T10:00:00.000Z');
export const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

export function harness() {
  const outcomes: Outcome[] = [];
  let n = 0;
  const watcher = createWatcher({ onOutcome: (o) => outcomes.push(o), newId: () => `inc-${++n}` });
  const accepted = (rule?: RuleId) =>
    outcomes.filter((o) => o.status === 'accepted' && (!rule || o.detection.rule === rule));
  return { watcher, outcomes, accepted };
}

export const signal = (
  kind: Signal['kind'],
  seconds: number,
  service = 'api',
  source: Signal['source'] = 'docker',
): RuntimeEvent => ({
  kind: 'signal',
  signal: {
    id: `s-${kind}-${seconds}`,
    service,
    kind,
    severity: 'warning',
    source,
    fingerprint: `${service}:${kind}`,
    message: kind,
    observedAt: at(seconds),
  },
});
