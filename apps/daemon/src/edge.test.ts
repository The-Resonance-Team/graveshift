import { describe, expect, test } from 'bun:test';

import { makeBunEdge, type Serve } from './edge';

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
    expect(received).toEqual({ port: 1234, fetch });
    expect(listener.port).toBe(1234);
    listener.stop();
    expect(closedWith).toBe(true);
  });
});
