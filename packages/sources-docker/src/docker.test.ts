import { describe, expect, test } from 'bun:test';
import { runRuntimeSourceContract } from '@graveshift/core/contract';
import type { RuntimeEvent } from '@graveshift/core';
import fc from 'fast-check';

import { demuxLogs, DockerApi, type DockerEvent, DockerSourceError } from './api';
import { mapDockerEvent } from './map';
import { createDockerSource } from './source';
import { backoffMs } from './watch';

const BASE = 'http://socket-proxy:2375';
const containers = [
  {
    Id: 'c1',
    Names: ['/shop-api-1'],
    Labels: { 'com.docker.compose.service': 'api' },
    State: 'running',
  },
  {
    Id: 'c2',
    Names: ['/shop-worker-1'],
    Labels: { 'com.docker.compose.service': 'worker' },
    State: 'running',
  },
];

const frame = (text: string) => {
  const payload = new TextEncoder().encode(text);
  const out = new Uint8Array(8 + payload.length);
  out[0] = 1;
  new DataView(out.buffer).setUint32(4, payload.length);
  out.set(payload, 8);
  return out;
};

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

const ndjson = (events: DockerEvent[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';

interface FakeOptions {
  streams?: Array<DockerEvent[] | 'fail'>;
  requests?: string[];
}

function fakeDocker({ streams = [], requests = [] }: FakeOptions = {}): typeof fetch {
  let connection = 0;
  return (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input.toString());
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname === '/containers/json') return Response.json(containers);
    if (url.pathname.endsWith('/logs')) return new Response(frame('line one\nline two\n'));
    if (url.pathname.endsWith('/json'))
      return Response.json({ State: { Status: 'running', Running: true } });
    if (url.pathname === '/events') {
      const next = streams[connection++] ?? [];
      if (next === 'fail') return new Response('nope', { status: 503 });
      return new Response(ndjson(next));
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

runRuntimeSourceContract('docker', () =>
  createDockerSource({ baseUrl: BASE, fetch: fakeDocker() }),
);

describe('docker source', () => {
  test('rejects anything but an http(s) proxy URL', () => {
    for (const url of [
      'unix:///var/run/docker.sock',
      'http://x/var/run/docker.sock',
      'file:///x',
    ]) {
      expect(() => new DockerApi(url)).toThrow(DockerSourceError);
    }
  });

  test('only issues GET requests', async () => {
    const requests: string[] = [];
    const source = createDockerSource({ baseUrl: BASE, fetch: fakeDocker({ requests }) });
    await source.listServices();
    await source.tailLogs('api', 5);
    await source.getHealth('worker');
    expect(requests.every((r) => r.startsWith('GET '))).toBe(true);
  });

  test('lists compose services and tails demuxed logs', async () => {
    const source = createDockerSource({ baseUrl: BASE, fetch: fakeDocker() });
    expect((await source.listServices()).map((s) => s.name)).toEqual(['api', 'worker']);
    expect(await source.tailLogs('api', 1)).toEqual(['line two']);
    await expect(source.tailLogs('ghost', 1)).rejects.toBeInstanceOf(DockerSourceError);
  });

  test('maps docker events to signals', () => {
    expect(mapDockerEvent(event('oom', 10), 'api')).toMatchObject({
      kind: 'oom',
      severity: 'critical',
      source: 'docker',
    });
    expect(mapDockerEvent(event('die', 10, { exitCode: '137' }), 'api')?.kind).toBe('restart');
    expect(mapDockerEvent(event('die', 10, { exitCode: '0' }), 'api')).toBeNull();
    expect(mapDockerEvent(event('health_status: unhealthy', 10), 'api')?.kind).toBe('unhealthy');
    expect(mapDockerEvent(event('start', 10), 'api')).toBeNull();
  });

  test('reconnects with backoff, resumes from the cursor and does not redeliver', async () => {
    const requests: string[] = [];
    const delays: number[] = [];
    const received: RuntimeEvent[] = [];
    const streams: FakeOptions['streams'] = [
      [event('oom', 100)],
      'fail',
      [event('oom', 100), event('health_status: unhealthy', 101)],
    ];
    const source = createDockerSource({
      baseUrl: BASE,
      fetch: fakeDocker({ streams, requests }),
      sleep: async (ms) => void delays.push(ms),
    });
    const done = Promise.withResolvers<void>();
    const stop = await source.watchEvents((e) => {
      received.push(e);
      if (received.filter((r) => r.kind === 'signal').length === 2) done.resolve();
    });
    await done.promise;
    stop();
    const kinds = received.map((e) => (e.kind === 'signal' ? e.signal.kind : e.kind));
    expect(kinds).toEqual([
      'oom',
      'source_disconnected',
      'source_disconnected',
      'source_reconnected',
      'unhealthy',
    ]);
    expect(delays.slice(0, 2)).toEqual([500, 1000]);
    const eventRequests = requests.filter((r) => r.includes('/events'));
    expect(eventRequests[1]).toContain('since=100');
    expect(eventRequests[2]).toContain('since=100');
  });

  test('a throwing subscriber does not stop the watch', async () => {
    const source = createDockerSource({
      baseUrl: BASE,
      fetch: fakeDocker({ streams: [[event('oom', 1), event('oom', 2)]] }),
      sleep: async () => {},
    });
    let calls = 0;
    const done = Promise.withResolvers<void>();
    const stop = await source.watchEvents(() => {
      calls += 1;
      if (calls === 2) done.resolve();
      throw new Error('boom');
    });
    await done.promise;
    stop();
  });
});

describe('properties', () => {
  test('backoff is capped, monotone and doubles until the cap', () => {
    fc.assert(
      fc.property(fc.nat(100), (attempt) => {
        expect(backoffMs(attempt)).toBeLessThanOrEqual(30_000);
        expect(backoffMs(attempt + 1)).toBeGreaterThanOrEqual(backoffMs(attempt));
        if (backoffMs(attempt) < 30_000)
          expect(backoffMs(attempt + 1)).toBe(Math.min(30_000, backoffMs(attempt) * 2));
      }),
    );
  });

  test('demuxLogs recovers the framed text for any chunking', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme-ascii' }), { maxLength: 6 }), (parts) => {
        const frames = parts.map(frame);
        const raw = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
        let offset = 0;
        for (const f of frames) {
          raw.set(f, offset);
          offset += f.length;
        }
        expect(demuxLogs(raw)).toBe(parts.join(''));
      }),
    );
  });

  test('mapped signals always satisfy the shared Signal schema', async () => {
    const { SignalSchema } = await import('@graveshift/core');
    fc.assert(
      fc.property(
        fc.constantFrom('oom', 'die', 'health_status: unhealthy', 'start'),
        fc.integer({ min: 0, max: 2_000_000_000 }),
        fc.constantFrom('0', '1', '137'),
        (action, time, exitCode) => {
          const signal = mapDockerEvent(event(action, time, { exitCode }), 'api');
          if (signal) SignalSchema.parse(signal);
        },
      ),
    );
  });
});
