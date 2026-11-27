import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { createDockerRestarter } from './backends';
import { setup, signed, T0 } from './test-helpers';
import type { HttpFetch } from './types';

describe('allowlist and scale bounds', () => {
  test('property: scale runs iff the service is worker and replicas are within 1..3', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('api', 'worker', 'postgres'),
        fc.integer({ min: 0, max: 8 }),
        async (service, replicas) => {
          const { actuator } = setup();
          const outcome = await actuator.execute(
            signed({ service, kind: 'scale', replicas, signals: [] }),
          );
          expect(outcome.status === 'executed').toBe(
            service === 'worker' && replicas >= 1 && replicas <= 3,
          );
        },
      ),
    );
  });

  test('docker restarts are resolved by compose label and POST only restart', async () => {
    const seen: string[] = [];
    const fetchFn: HttpFetch = async (url, init) => {
      seen.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      return url.pathname === '/containers/json'
        ? Response.json([{ Id: 'abc' }])
        : new Response(null, { status: 204 });
    };
    await createDockerRestarter('http://socket-proxy-actuator:2375', fetchFn).restart('worker');
    expect(seen).toEqual(['GET /containers/json', 'POST /containers/abc/restart']);
    expect(() => createDockerRestarter('unix:///var/run/docker.sock')).toThrow();
  });

  test.each([null, [{ Name: 'missing-id' }], { Id: 'not-an-array' }])(
    'invalid container lookup %j cannot cause a restart',
    async (body) => {
      const seen: string[] = [];
      const fetchFn: HttpFetch = async (url) => {
        seen.push(url.pathname);
        return Response.json(body);
      };
      await expect(
        createDockerRestarter('http://socket-proxy-actuator:2375', fetchFn).restart('worker'),
      ).rejects.toThrow('invalid data');
      expect(seen).toEqual(['/containers/json']);
    },
  );
});

describe('circuit breaker', () => {
  test('property: trips iff the incident reopens within 10 minutes of an action, pages once, blocks actions', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 30 * 60_000 }), async (gap) => {
        const { actuator, pages, calls, setNow } = setup();
        expect((await actuator.execute(signed())).status).toBe('executed');
        const tripped = actuator.breaker.reopened('api', T0 + gap);
        expect(tripped).toBe(gap < 10 * 60_000);
        actuator.breaker.reopened('api', T0 + gap);
        expect(pages).toHaveLength(tripped ? 1 : 0);
        setNow(T0 + gap);
        const next = await actuator.execute(signed({ tokenId: 'tok-2', issuedOffset: gap - 1000 }));
        expect(next.status === 'denied' && next.reason === 'circuit_open').toBe(tripped);
        expect(calls).toHaveLength(tripped ? 1 : 2);
      }),
    );
  });

  test('reset re-enables a service and other services are unaffected', async () => {
    const { actuator, setNow } = setup();
    await actuator.execute(signed());
    actuator.breaker.reopened('api', T0 + 1000);
    setNow(T0 + 11 * 60_000);
    expect(actuator.breaker.isOpen('worker')).toBe(false);
    actuator.breaker.reset('api');
    const again = signed({ tokenId: 'tok-3', issuedOffset: 11 * 60_000 - 1000 });
    expect((await actuator.execute(again)).status).toBe('executed');
  });
});
