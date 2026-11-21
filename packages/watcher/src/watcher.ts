import type { RuntimeEvent } from '@graveshift/core';

import { createDedupe, createGrouper, isSilenced } from './pipeline';
import { createRules } from './rules';
import type { Detection, Outcome, Silence } from './types';

export interface WatcherOptions {
  onOutcome: (outcome: Outcome) => void;
  newId?: () => string;
  dedupeMs?: number;
}

export function createWatcher({ onOutcome, newId, dedupeMs }: WatcherOptions) {
  const rules = createRules();
  const dedupe = createDedupe(dedupeMs);
  const grouper = createGrouper(newId);
  const silences: Silence[] = [];

  // silence first, so a signal suppressed by a salt line does not start a dedupe window
  const process = (detections: Detection[]): void => {
    for (const detection of detections) {
      if (isSilenced(silences, detection)) onOutcome({ status: 'suppressed', detection });
      else if (!dedupe.accept(detection)) onOutcome({ status: 'duplicate', detection });
      else onOutcome({ status: 'accepted', detection, change: grouper.add(detection) });
    }
  };

  return {
    ingest: (event: RuntimeEvent) => process(rules.runtimeEvent(event)),
    log: (service: string, line: string, at: string) =>
      process(rules.logLine(service, line, Date.parse(at))),
    healthCheck: (service: string, ok: boolean, at: string) =>
      process(rules.healthCheck(service, ok, Date.parse(at))),
    metrics: (
      service: string,
      sample: { errorRate5xx: number | null; p95LatencySeconds: number | null },
      at: string,
    ) => process(rules.metrics(service, sample, Date.parse(at))),
    silence: (silence: Silence) => void silences.push(silence),
    release: grouper.release,
    openIncidents: grouper.openIncidents,
  };
}
export type Watcher = ReturnType<typeof createWatcher>;
