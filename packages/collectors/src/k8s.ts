import type { Signal } from '@graveshift/core';
import {
  mapK8sEvent,
  serviceOf,
  startWatchLoop,
  WatchExpiredError,
  type K8sEvent,
  type KubeApi,
} from '@graveshift/sources-k8s';
import { type Integration, validateContext } from '@graveshift/integrations';

import { createObserver, reason, signalObservation, type Sleep } from './publish';

export interface K8sCollectorOptions {
  /**
   * The read-only kube surface (get/list/watch). Tests inject a fake. The host
   * builds the real one with createKubeApi, so this Collector never reads a
   * secret or opens a cluster connection itself.
   */
  api: KubeApi;
  sleep?: Sleep;
  warn?: (message: string) => void;
}

const SOURCE = 'collector.kubernetes';

/**
 * Watch Kubernetes events and publish one envelope per observation for the
 * Grave named in Context.service. The host runs one Collector per Grave.
 * Fail closed at start on a bad context or a second start; fail open on
 * every publish. Call stop() before starting again.
 */
export function createK8sCollector(options: K8sCollectorOptions): Integration {
  const warn = options.warn ?? (() => {});
  let stopLoop: (() => void) | undefined;

  return {
    name: 'kubernetes-collector',
    kind: 'collector',

    start(context) {
      validateContext(context);
      // one live loop: a second start leaks the first unless stop() ran first
      if (stopLoop) throw new Error('kubernetes collector is already started');
      const observer = createObserver(context, warn);
      let cursor: string | undefined;
      const seen = new Set<string>();

      const emitOomEnrichment = async (event: K8sEvent, crash: Signal): Promise<void> => {
        try {
          if (
            event.involvedKind !== 'Pod' ||
            !(await options.api.podOomKilled(event.namespace, event.involvedName))
          )
            return;
          const oom: Signal = {
            ...crash,
            id: `${crash.id}:oom`,
            kind: 'oom',
            fingerprint: `${crash.service}:oom`,
          };
          observer(
            signalObservation(SOURCE, oom, {
              namespace: event.namespace,
              involvedKind: event.involvedKind,
              involvedName: event.involvedName,
              reason: event.reason,
            }),
          );
        } catch (error) {
          // enrichment is best-effort; the crash_loop observation was already published
          warn(
            `kubernetes oom enrichment failed for pod ${event.namespace}/${event.involvedName}: ${reason(error)}`,
          );
        }
      };

      stopLoop = startWatchLoop({
        // Housekeeping events stay out of the envelope stream and go to warn instead.
        emit: (event) => {
          if (event.kind === 'source_disconnected')
            warn(`kubernetes source disconnected: ${event.reason}`);
          else if (event.kind === 'source_reconnected')
            warn(
              `kubernetes source reconnected${event.cursor === undefined ? '' : ` at cursor ${event.cursor}`}`,
            );
        },
        ...(options.sleep ? { sleep: options.sleep } : {}),
        async connect(signal, connected) {
          // ponytail: after a 410 Gone the gap is not replayed, upgrade if lost events matter
          cursor ??= await options.api.latestEventVersion();
          try {
            await options.api.watchEvents(
              cursor,
              (event) => {
                const key = event.uid + event.resourceVersion;
                if (seen.has(key)) return;
                // A cleared set can let a replayed event through. That is safe:
                // the envelope id is stable, and the publisher deduplicates it by
                // JetStream msgID.
                if (seen.size > 1000) seen.clear();
                seen.add(key);
                cursor = event.resourceVersion;
                if (serviceOf(event) !== context.service) return;
                const mapped = mapK8sEvent(event);
                if (!mapped) return;
                observer(
                  signalObservation(SOURCE, mapped, {
                    namespace: event.namespace,
                    involvedKind: event.involvedKind,
                    involvedName: event.involvedName,
                    reason: event.reason,
                  }),
                );
                if (mapped.kind === 'crash_loop') void emitOomEnrichment(event, mapped);
              },
              signal,
              () => connected(cursor),
            );
          } catch (error) {
            if (error instanceof WatchExpiredError) cursor = undefined;
            throw error;
          }
        },
      });
    },

    stop() {
      stopLoop?.();
      stopLoop = undefined;
    },
  };
}
