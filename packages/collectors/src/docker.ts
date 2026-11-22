import {
  DockerApi,
  mapDockerEvent,
  startWatchLoop,
  type DockerEvent,
} from '@graveshift/sources-docker';
import { type Integration, validateContext } from '@graveshift/integrations';

import { createObserver, signalObservation, type Sleep } from './publish';

export interface DockerCollectorOptions {
  /** The docker-socket-proxy HTTP URL. A unix socket path fails closed at start. */
  baseUrl: string;
  /** Injected in tests. No real socket or network call runs there. */
  fetch?: typeof fetch;
  sleep?: Sleep;
  warn?: (message: string) => void;
}

const SOURCE = 'collector.docker';

/**
 * Watch one Docker host and publish one envelope per observation for the
 * Grave named in Context.service. The host runs one Collector per Grave.
 * Fail closed at start on a bad context or a second start; fail open on
 * every publish. Call stop() before starting again.
 */
export function createDockerCollector(options: DockerCollectorOptions): Integration {
  const warn = options.warn ?? (() => {});
  let stopLoop: (() => void) | undefined;

  return {
    name: 'docker-collector',
    kind: 'collector',

    start(context) {
      validateContext(context);
      // one live loop: a second start leaks the first unless stop() ran first
      if (stopLoop) throw new Error('docker collector is already started');
      const api = new DockerApi(options.baseUrl, options.fetch);
      const observer = createObserver(context, warn);
      // ponytail: cursor dedupe mirrors createDockerSource, upgrade when the v1 source retires and this is the only reader
      let cursor: number | undefined;
      let seenAtCursor = new Set<string>();
      const names = new Map<string, string>();

      const containerService = (event: DockerEvent): string => {
        const attrs = event.Actor.Attributes;
        const service =
          attrs['com.docker.compose.service'] ??
          names.get(event.Actor.ID) ??
          attrs.name ??
          event.Actor.ID;
        names.set(event.Actor.ID, service);
        return service;
      };

      stopLoop = startWatchLoop({
        // Housekeeping events stay out of the envelope stream and go to warn instead.
        emit: (event) => {
          if (event.kind === 'source_disconnected')
            warn(`docker source disconnected: ${event.reason}`);
          else if (event.kind === 'source_reconnected')
            warn(
              `docker source reconnected${event.cursor === undefined ? '' : ` at cursor ${event.cursor}`}`,
            );
        },
        ...(options.sleep ? { sleep: options.sleep } : {}),
        async connect(signal, connected) {
          const stream = await api.events(cursor, signal, () =>
            connected(cursor === undefined ? undefined : String(cursor)),
          );
          for await (const event of stream) {
            const key = `${event.Actor.ID}:${event.Action}:${event.timeNano ?? event.time}`;
            if (
              cursor !== undefined &&
              (event.time < cursor || (event.time === cursor && seenAtCursor.has(key)))
            )
              continue;
            if (event.time !== cursor) seenAtCursor = new Set();
            cursor = event.time;
            seenAtCursor.add(key);
            const service = containerService(event);
            if (service !== context.service) continue;
            const mapped = mapDockerEvent(event, service);
            if (!mapped) continue;
            observer(
              signalObservation(SOURCE, mapped, {
                action: event.Action,
                containerId: event.Actor.ID,
              }),
            );
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
