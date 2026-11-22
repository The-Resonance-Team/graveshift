import type { WorkItem } from '@graveshift/core';

import type { FixContextLoad, FixContextProvider } from './fix.types';

/** The read side of the work-item store: the counter source without a Nest import. */
export interface WorkItemReader {
  list(): WorkItem[];
}

// Triage writes these prefixed labels when it classifies a work item. The
// context is built from them and from stored Work item data only. The daemon
// read surface (ticket #48) stores no diagnosis and no usage: a durable
// counter does not exist to read yet.
// ponytail: counters come from local sources; upgrade if #48 daemon read API exposes real diagnosis and usage counters
const CONFIDENCE_PREFIX = 'confidence:';
const CATEGORY_PREFIX = 'category:';
const SIGNAL_PREFIX = 'signal:';
const HOUR_MS = 60 * 60 * 1000;

const labeled = (item: WorkItem, prefix: string): string | undefined => {
  for (const label of item.labels) {
    if (label.startsWith(prefix)) {
      const value = label.slice(prefix.length).trim();
      if (value !== '') return value;
    }
  }
  return undefined;
};

const countOpenPrsLastHour = (store: WorkItemReader, id: string, now: Date): number => {
  const cutoff = now.getTime() - HOUR_MS;
  let count = 0;
  for (const item of store.list()) {
    if (item.id === id) continue;
    const pr = item.draftPr;
    if (pr !== null && new Date(pr.openedAt).getTime() >= cutoff) count++;
  }
  return count;
};

export interface LocalContextSources {
  readonly store: WorkItemReader;
  readonly spendTodayUsd: () => number;
  readonly now: () => Date;
}

/**
 * Builds the policy context from real Work item data only. A work item without
 * trustworthy triage labels fails closed: no model call, source read or GitHub
 * call happens on a guessed confidence or category.
 */
export function createLocalFixContextProvider(sources: LocalContextSources): FixContextProvider {
  return {
    async load(item: WorkItem): Promise<FixContextLoad> {
      const rawConfidence = labeled(item, CONFIDENCE_PREFIX);
      if (rawConfidence === undefined) {
        return { ok: false, reason: `context_unavailable: ${item.id} has no triage confidence` };
      }
      const confidence = Number(rawConfidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return { ok: false, reason: `context_unavailable: ${item.id} has a malformed confidence` };
      }
      const category = labeled(item, CATEGORY_PREFIX);
      if (category === undefined) {
        return { ok: false, reason: `context_unavailable: ${item.id} has no triage category` };
      }
      const signal = labeled(item, SIGNAL_PREFIX);
      return {
        ok: true,
        value: {
          confidence,
          category,
          // The classified category is the standing signal; a triage signal
          // label adds the concrete detection when one exists.
          signals: signal === undefined ? [category] : [category, signal],
          counters: {
            // #49 owns the runtime-action ledger and #61 the watcher owns
            // diagnosis loops after 'changes_requested'; neither exists yet,
            // so this fix path issued no runtime action and no re-diagnosis.
            actionsLast10Min: 0,
            openPrsLastHour: countOpenPrsLastHour(sources.store, item.id, sources.now()),
            diagnosisLoops: 0,
            llmSpentTodayUsd: sources.spendTodayUsd(),
          },
        },
      };
    },
  };
}
