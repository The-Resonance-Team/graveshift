import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { DEFAULT_HOSTNAME, makeBunEdge, startListener, type Serve } from './edge';
import { handleRequest } from './routes';

describe('HTTP edge adapter', () => {
  test('start delegates to the injected serve function', () => {
    let received: Parameters<Serve>[0] | undefined;
    let closedWith: boolean | undefined;
    const fakeServe: Serve = (options) => {
      received = options;
      return {
        port: 1234,
        stop: (closeActiveConnections) => {
          closedWith = closeActiveConnections;
        },
      };
    };
    const fetch = () => new Response('ok');
    const listener = makeBunEdge(fakeServe).start({ port: 1234, fetch });
    expect(received).toEqual({ port: 1234, hostname: DEFAULT_HOSTNAME, fetch });
    expect(listener.port).toBe(1234);
    listener.stop();
    expect(closedWith).toBe(false);
    listener.stop({ drain: false });
    expect(closedWith).toBe(true);
  });

  test('a hostname overrides the default', () => {
    let received: Parameters<Serve>[0] | undefined;
    const fakeServe: Serve = (options) => {
      received = options;
      return { port: 1234, stop: () => {} };
    };
    makeBunEdge(fakeServe).start({ port: 1234, hostname: 'localhost', fetch: handleRequest });
    expect(received?.hostname).toBe('localhost');
  });

  test('startup failures are tagged', async () => {
    const failingServe: Serve = () => {
      throw new Error('EADDRINUSE');
    };
    const error = await Effect.runPromise(
      Effect.flip(startListener(makeBunEdge(failingServe), { port: 1234, fetch: handleRequest })),
    );
    expect(error._tag).toBe('HttpEdgeStartError');
  });

  test('real Bun.serve serves the health route', async () => {
    const listener = makeBunEdge().start({ port: 0, fetch: handleRequest });
    try {
      const response = await fetch(`http://${DEFAULT_HOSTNAME}:${listener.port}/healthz`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      listener.stop({ drain: false });
    }
  });
});
