import type { EventEnvelope } from '@graveshift/core';
import type { Clock, Context } from '@graveshift/integrations';

import type { DockerEvent } from './api';

export const BASE = 'http://socket-proxy:2375';
export const clock: Clock = {
  now: () => '2026-11-20T10:00:00.000Z',
  newId: () => crypto.randomUUID(),
};
export const containers = [
  {
    Id: 'c1',
    Names: ['/shop-api-1'],
    Labels: { 'com.docker.compose.service': 'api' },
    State: 'running',
  },
  { Id: 'c2', Names: ['/worker'], Labels: {}, State: 'running' },
];

export const event = (
  action: string,
  time: number,
  attrs: Record<string, string> = {},
): DockerEvent => ({
  Type: 'container',
  Action: action,
  Actor: { ID: 'c1', Attributes: { 'com.docker.compose.service': 'api', name: 'api-1', ...attrs } },
  time,
  timeNano: time * 1_000_000_000,
});

export const frame = (text: string) => {
  const payload = new TextEncoder().encode(text);
  const out = new Uint8Array(8 + payload.length);
  out[0] = 1;
  new DataView(out.buffer).setUint32(4, payload.length);
  out.set(payload, 8);
  return out;
};

export function context(onPublish: (event: EventEnvelope) => void = () => {}) {
  const envelopes: EventEnvelope[] = [];
  const value: Context = {
    projectId: 'project-1',
    service: 'local',
    publisher: {
      async publish(envelope) {
        envelopes.push(envelope);
        onPublish(envelope);
      },
    },
  };
  return { value, envelopes };
}

export function fakeDocker(streams: Array<DockerEvent[] | 'fail'> = []) {
  const requests: URL[] = [];
  const signals: AbortSignal[] = [];
  const fetchFn: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.pathname === '/containers/json') return Response.json(containers);
      if (url.pathname.endsWith('/logs')) return new Response(frame('one\ntwo\n'));
      if (url.pathname.endsWith('/json'))
        return Response.json({ State: { Status: 'running', Running: true } });
      if (url.pathname === '/events') {
        if (init?.signal) signals.push(init.signal);
        const next = streams.shift();
        if (next === 'fail') return new Response('offline', { status: 503 });
        if (next) return new Response(next.map((item) => JSON.stringify(item)).join('\n') + '\n');
        return new Response(
          new ReadableStream({
            start(controller) {
              if (init?.signal?.aborted) controller.close();
              else
                init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
            },
          }),
        );
      }
      return new Response(null, { status: 404 });
    },
    { preconnect() {} },
  );
  return { fetchFn, requests, signals };
}
