import type { RuntimeEvent, RuntimeSource, ServiceHealth, ServiceInfo } from '@graveshift/core';

import { type Container, DockerApi, DockerSourceError, serviceName } from './api';
import { mapDockerEvent } from './map';
import { type Sleep, startWatchLoop } from './watch';

export interface DockerSourceOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  sleep?: Sleep;
  now?: () => Date;
}

export function createDockerSource(options: DockerSourceOptions): RuntimeSource {
  const api = new DockerApi(options.baseUrl, options.fetch);
  const stops = new Set<() => void>();
  let cursor: number | undefined;
  let seenAtCursor = new Set<string>();

  const containerOf = async (service: string): Promise<Container> => {
    const found = (await api.containers()).find((c) => serviceName(c) === service);
    if (!found) throw new DockerSourceError('SERVICE_NOT_FOUND', `unknown service ${service}`);
    return found;
  };

  return {
    async listServices(): Promise<ServiceInfo[]> {
      const names = new Set((await api.containers()).map(serviceName));
      return [...names].map((name) => ({ name, runtime: 'docker' as const }));
    },

    async watchEvents(cb) {
      const names = new Map<string, string>();
      const stop = startWatchLoop({
        emit: cb,
        ...(options.sleep ? { sleep: options.sleep } : {}),
        ...(options.now ? { now: options.now } : {}),
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
            const service =
              event.Actor.Attributes['com.docker.compose.service'] ??
              names.get(event.Actor.ID) ??
              event.Actor.Attributes.name ??
              event.Actor.ID;
            names.set(event.Actor.ID, service);
            const mapped = mapDockerEvent(event, service);
            if (mapped)
              cb({ kind: 'signal', cursor: String(cursor), signal: mapped } satisfies RuntimeEvent);
          }
        },
      });
      stops.add(stop);
      return () => {
        stop();
        stops.delete(stop);
      };
    },

    async tailLogs(service, lines) {
      return api.logs((await containerOf(service)).Id, lines);
    },

    async getHealth(service): Promise<ServiceHealth> {
      const { State } = await api.inspect((await containerOf(service)).Id);
      const checkedAt = (options.now ?? (() => new Date()))().toISOString();
      const health = State.Health?.Status;
      let status: ServiceHealth['status'];
      if (health === 'unhealthy' || !State.Running) status = 'unhealthy';
      else if (health === 'starting' || State.Status === 'restarting') status = 'degraded';
      else status = 'healthy';
      return {
        service,
        status,
        checkedAt,
        ...(State.OOMKilled ? { detail: 'last exit was OOMKilled' } : {}),
      };
    },

    async close() {
      for (const stop of stops) stop();
      stops.clear();
    },
  };
}
