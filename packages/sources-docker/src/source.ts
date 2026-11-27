import {
  envelopeBuilder,
  createDeliveryQueue,
  type Clock,
  type CollectorReads,
  type Context,
  type GraveHealth,
  type Integration,
  type Sleep,
  startWatchLoop,
  systemClock,
  validateContext,
} from '@graveshift/integrations';

import { type Container, DockerApi, DockerSourceError, serviceName } from './api';
import { mapDockerEventDetails } from './map-details';

export interface DockerCollectorOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  sleep?: Sleep;
  clock?: Clock;
}

export interface DockerCollector extends Integration, CollectorReads {}

export function createDockerCollector(options: DockerCollectorOptions): DockerCollector {
  const api = new DockerApi(options.baseUrl, options.fetch);
  const clock = options.clock ?? systemClock;
  let lifetime: ReturnType<typeof startWatchLoop> | undefined;
  let delivery: ReturnType<typeof createDeliveryQueue> | undefined;
  let stopping: Promise<void> | undefined;
  let binding: string | undefined;
  let cursor: number | undefined;
  let replayFrom: number | undefined;
  let seenAtCursor = new Set<string>();
  const names = new Map<string, string>();

  const containerOf = async (service: string): Promise<Container> => {
    const found = (await api.containers()).find((container) => serviceName(container) === service);
    if (!found) throw new DockerSourceError('SERVICE_NOT_FOUND', `unknown service ${service}`);
    return found;
  };

  return {
    name: 'docker',
    kind: 'collector',
    start(context: Context) {
      validateContext(context);
      if (lifetime || stopping) throw new Error('Docker Collector is already active');
      const nextBinding = JSON.stringify([context.projectId, context.service]);
      if (binding !== nextBinding) {
        cursor = undefined;
        replayFrom = undefined;
        seenAtCursor.clear();
        names.clear();
        binding = nextBinding;
      }
      const queue = createDeliveryQueue(context.publisher, options.sleep);
      delivery = queue;
      lifetime = startWatchLoop({
        ...(options.sleep ? { sleep: options.sleep } : {}),
        notice: (notice) =>
          queue.notice(
            envelopeBuilder(
              context,
              clock,
            )({
              source: 'collector.docker',
              type: notice.type,
              severity: 'info',
              traceId: clock.newId(),
              fingerprint: `${context.service}:${notice.type}`,
              payload: { ...notice },
            }),
          ),
        async connect(signal, connected) {
          const stream = await api.events(cursor ?? replayFrom, signal, () =>
            connected(cursor === undefined ? undefined : String(cursor)),
          );
          try {
            for await (const event of stream) {
              if (!(await queue.ready(signal))) break;
              const key = `${event.Actor.ID}:${event.Action}:${event.timeNano ?? event.time}`;
              if (
                cursor !== undefined &&
                (event.time < cursor || (event.time === cursor && seenAtCursor.has(key)))
              )
                continue;
              if (queue.has(key)) continue;
              replayFrom ??= event.time;
              const service =
                event.Actor.Attributes['com.docker.compose.service'] ??
                names.get(event.Actor.ID) ??
                event.Actor.Attributes.name ??
                event.Actor.ID;
              names.set(event.Actor.ID, service);
              const details = mapDockerEventDetails(event, service);
              queue.enqueue({
                key,
                async deliver(send) {
                  if (!details) return;
                  const envelope = envelopeBuilder(
                    { ...context, service },
                    clock,
                  )({
                    ...details,
                    id: `${context.projectId}:${context.service}:${details.id}`,
                  });
                  await send(envelope);
                },
                acknowledge() {
                  if (event.time !== cursor) seenAtCursor = new Set();
                  cursor = event.time;
                  seenAtCursor.add(key);
                  if (event.Action === 'destroy') names.delete(event.Actor.ID);
                },
              });
            }
          } finally {
            await queue.drain();
          }
        },
      });
    },
    async stop() {
      if (stopping) return stopping;
      if (!lifetime) return;
      const current = lifetime;
      stopping = Promise.all([current.stop(), delivery?.stop()]).then(() => {});
      try {
        await stopping;
      } finally {
        lifetime = undefined;
        delivery = undefined;
        stopping = undefined;
      }
    },
    async listServices() {
      const services = new Set((await api.containers()).map(serviceName));
      return [...services].map((name) => ({ name, runtime: 'docker' as const }));
    },
    async tailLogs(service, lines) {
      return api.logs((await containerOf(service)).Id, lines);
    },
    async getHealth(service): Promise<GraveHealth> {
      const { State } = await api.inspect((await containerOf(service)).Id);
      const health = State.Health?.Status;
      let status: GraveHealth['status'];
      if (health === 'unhealthy' || !State.Running) status = 'unhealthy';
      else if (health === 'starting' || State.Status === 'restarting') status = 'degraded';
      else status = 'healthy';
      return {
        service,
        status,
        checkedAt: clock.now(),
        ...(State.OOMKilled ? { detail: 'last exit was OOMKilled' } : {}),
      };
    },
  };
}
