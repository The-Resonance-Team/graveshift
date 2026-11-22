import type { DockerEvent } from '@graveshift/sources-docker';
import { EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createDockerCollector } from './docker';
import { hangingSleep, makeContext, rejectingPublisher, flush } from './test-helpers';

const BASE = 'http://socket-proxy:2375';

const event = (
  action: string,
  time: number,
  attrs: Record<string, string> = {},
  id = 'c1',
): DockerEvent => ({
  Type: 'container',
  Action: action,
  Actor: {
    ID: id,
    Attributes: { 'com.docker.compose.service': 'api', name: 'shop-api-1', ...attrs },
  },
  time,
  timeNano: time * 1_000_000_000,
});

const ndjson = (events: DockerEvent[]): string =>
  events.map((e) => JSON.stringify(e)).join('\n') + '\n';

interface FakeDockerOptions {
  batches: DockerEvent[][];
  requests: string[];
}

/** Serves queued ndjson batches on /events. The last batch repeats, so a reconnect replays it. */
function fakeDocker({ batches, requests }: FakeDockerOptions): typeof fetch {
  let connection = 0;
  return (async (input: URL | string) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    if (url.pathname !== '/events') return new Response('[]', { status: 404 });
    const batch = batches[Math.min(connection, batches.length - 1)] ?? [];
    connection += 1;
    return new Response(ndjson(batch));
  }) as unknown as typeof fetch;
}

const oomEvents = (): DockerEvent[] => [
  event('oom', 1_000),
  event('die', 1_001, { exitCode: '1' }),
  event('health_status: unhealthy', 1_002),
  event('die', 1_003, { exitCode: '0' }),
  event('die', 1_004, { 'com.docker.compose.service': 'worker', exitCode: '1' }, 'c2'),
];

async function startedCollector(
  options: FakeDockerOptions,
  sleepOverride?: (ms: number, signal: AbortSignal) => Promise<void>,
) {
  const setup = makeContext();
  const warnings: string[] = [];
  const { sleep, delays } = hangingSleep();
  const collector = createDockerCollector({
    baseUrl: BASE,
    fetch: fakeDocker(options),
    sleep: sleepOverride ?? sleep,
    warn: (m) => warnings.push(m),
  });
  await collector.start(setup.context);
  await flush();
  return { ...setup, collector, warnings, delays };
}

describe('docker collector', () => {
  test('publishes one valid envelope per observation for the grave only', async () => {
    const { collector, publisher, warnings } = await startedCollector({
      batches: [oomEvents()],
      requests: [],
    });

    expect(warnings).toEqual([]);
    const envelopes = publisher.envelopes;
    expect(envelopes).toHaveLength(3);
    for (const envelope of envelopes)
      expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(
      envelopes.map((e) => [e.source, e.service, e.projectId, e.type, e.severity, e.fingerprint]),
    ).toEqual([
      ['collector.docker', 'api', 'project-1', 'runtime.oom', 'critical', 'api:oom'],
      ['collector.docker', 'api', 'project-1', 'runtime.restart', 'warning', 'api:restart'],
      ['collector.docker', 'api', 'project-1', 'runtime.unhealthy', 'warning', 'api:unhealthy'],
    ]);
    // deterministic ids: the publisher can deduplicate a replay by msgID
    expect(envelopes.map((e) => e.id)).toEqual([
      'docker:c1:1000000000000:oom',
      'docker:c1:1001000000000:restart',
      'docker:c1:1002000000000:unhealthy',
    ]);
    expect(envelopes[1]?.payload).toMatchObject({ action: 'die', containerId: 'c1' });
    expect(envelopes[0]?.traceId).toBe(envelopes[0]?.id);
    await collector.stop();
  });

  test('redacts secrets in the message payload', async () => {
    const { collector, publisher } = await startedCollector({
      batches: [
        [event('die', 2_000, { exitCode: '1', name: 'ghp_abcdefghijklmnopqrstuvwxyz123456' })],
      ],
      requests: [],
    });
    const [envelope] = publisher.envelopes;
    expect(envelope?.payload?.message).toContain('[REDACTED:github_token]');
    await collector.stop();
  });

  test('skips a replayed observation with the same cursor and key', async () => {
    // the fake replays the last batch on reconnect, so the second pass sees the same events
    let first = true;
    const sleep = async (_ms: number, signal: AbortSignal): Promise<void> => {
      if (signal.aborted) return;
      if (first) {
        first = false;
        return;
      }
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };
    const { collector, publisher } = await startedCollector(
      { batches: [oomEvents(), oomEvents()], requests: [] },
      sleep,
    );
    await flush();
    await flush();
    expect(publisher.envelopes).toHaveLength(3);
    await collector.stop();
  });

  test('fail closed: start rejects a bad context before any read', async () => {
    const requests: string[] = [];
    const publisher = makeContext().publisher;
    const collector = createDockerCollector({
      baseUrl: BASE,
      fetch: fakeDocker({ batches: [[]], requests }),
    });

    expect(() => collector.start(undefined as never)).toThrow('object');
    expect(() =>
      collector.start({ publisher: {} as never, projectId: 'p', service: 'api' }),
    ).toThrow('publisher');
    expect(() => collector.start({ publisher, projectId: 'bad project', service: 'api' })).toThrow(
      'projectId',
    );
    expect(() => collector.start({ publisher, projectId: 'p', service: '' })).toThrow('service');
    expect(requests).toEqual([]);
    expect(publisher.envelopes).toHaveLength(0);
    await collector.stop();
  });

  test('fail closed: start rejects a unix socket url', async () => {
    const { context } = makeContext();
    const collector = createDockerCollector({
      baseUrl: 'unix:///var/run/docker.sock',
    });
    expect(() => collector.start(context)).toThrow('docker-socket-proxy');
    await collector.stop();
  });

  test('fail open: a rejected publish is reported and the loop continues', async () => {
    const publisher = rejectingPublisher(1);
    const { context } = makeContext({ publisher });
    const warnings: string[] = [];
    const { sleep } = hangingSleep();
    const collector = createDockerCollector({
      baseUrl: BASE,
      fetch: fakeDocker({ batches: [oomEvents()], requests: [] }),
      sleep,
      warn: (m) => warnings.push(m),
    });
    await collector.start(context);
    await flush();

    expect(publisher.attempted).toHaveLength(3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('nats unavailable');
    await collector.stop();
  });

  test('stop ends the loop and a second stop is a no-op', async () => {
    const { collector, publisher } = await startedCollector({
      batches: [oomEvents()],
      requests: [],
    });
    await collector.stop();
    await collector.stop();
    const before = publisher.envelopes.length;
    await flush();
    expect(publisher.envelopes).toHaveLength(before);
  });
});
