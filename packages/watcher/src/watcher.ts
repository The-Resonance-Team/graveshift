import {
  evaluateEnvelope,
  mergeRules,
  prepareEnvelope,
  type EventEnvelope,
  type Rule,
} from '@graveshift/core';

import { createDedupe, createGrouper, isSilenced } from './pipeline';
import { createRules } from './rules';
import type { Silence, WatcherOutcome } from './types';

export interface WatcherOptions {
  onOutcome?: (outcome: WatcherOutcome) => void | Promise<void>;
  systemRules?: readonly Rule[];
  clientRules?: readonly Rule[];
  newId?: () => string;
  dedupeMs?: number;
}

export function createWatcher(options: WatcherOptions = {}) {
  const observe = createRules();
  const rules = structuredClone(mergeRules(options.systemRules ?? [], options.clientRules ?? []));
  const dedupe = createDedupe(options.dedupeMs);
  const grouper = createGrouper(options.newId);
  const silences: Silence[] = [];

  return {
    ingest(input: EventEnvelope): WatcherOutcome[] {
      const envelope = prepareEnvelope(input);
      const action = evaluateEnvelope(envelope, rules);
      const outcomes = observe(envelope).map((found): WatcherOutcome => {
        const detection =
          action === 'escalate' ? { ...found, severity: 'critical' as const } : found;
        if (action === 'suppress' || isSilenced(silences, detection)) {
          return { envelope, status: 'suppressed', detection };
        }
        if (!dedupe.accept(detection)) return { envelope, status: 'duplicate', detection };
        return { envelope, status: 'accepted', detection, change: grouper.add(detection) };
      });
      for (const outcome of outcomes) {
        try {
          void Promise.resolve(options.onOutcome?.(structuredClone(outcome))).catch(() => {});
        } catch {
          // A failed outcome observer cannot interrupt the next observation.
        }
      }
      return outcomes;
    },
    silence: (silence: Silence) => void silences.push({ ...silence }),
    release: grouper.release,
    openIncidents: grouper.openIncidents,
  };
}
export type Watcher = ReturnType<typeof createWatcher>;
