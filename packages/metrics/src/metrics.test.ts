import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { createMetricsClient, MetricsError, WATCHER_QUERIES } from './index';

const reply = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const sample = (value: string) => ({
  status: 'success',
  data: { resultType: 'vector', result: [{ metric: {}, value: [1, value] }] },
});

describe('metrics client', () => {
  test('returns the first sample as a number', async () => {
    const client = createMetricsClient('http://prom:9090', reply(sample('0.25')));
    expect(await client.query('up')).toBe(0.25);
  });

  test('returns null for an empty result and for NaN', async () => {
    const empty = reply({ status: 'success', data: { result: [] } });
    expect(await createMetricsClient('http://prom:9090', empty).query('x')).toBeNull();
    expect(
      await createMetricsClient('http://prom:9090', reply(sample('NaN'))).query('x'),
    ).toBeNull();
  });

  test('sends the query to /api/v1/query', async () => {
    let seen = '';
    const spy = (async (input: URL) => {
      seen = input.toString();
      return new Response(JSON.stringify(sample('1')));
    }) as unknown as typeof fetch;
    await createMetricsClient('http://prom:9090', spy).watcher('up', 'demo-api');
    expect(seen).toStartWith('http://prom:9090/api/v1/query?query=');
    expect(decodeURIComponent(seen)).toContain('min(up{job="demo-api"})');
  });

  test('throws MetricsError on HTTP errors, prometheus errors and bad payloads', async () => {
    const bad = [
      reply({}, 500),
      reply({ status: 'error', errorType: 'bad_data', error: 'parse error' }),
      reply({ nope: true }),
    ];
    await Promise.all(
      bad.map((fetchFn) =>
        expect(createMetricsClient('http://prom:9090', fetchFn).query('x')).rejects.toBeInstanceOf(
          MetricsError,
        ),
      ),
    );
  });

  test('property: parsed value equals the numeric sample', async () => {
    await fc.assert(
      fc.asyncProperty(fc.double({ noNaN: true, noDefaultInfinity: true }), async (n) => {
        const client = createMetricsClient('http://prom:9090', reply(sample(String(n))));
        expect(await client.query('x')).toBe(n + 0);
      }),
    );
  });

  test('defines the five watcher queries', () => {
    expect(Object.keys(WATCHER_QUERIES)).toHaveLength(5);
    for (const build of Object.values(WATCHER_QUERIES)) expect(build('api')).toContain('job="api"');
  });
});
