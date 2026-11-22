import { EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { demuxLogs, DockerApi, DockerSourceError } from './api';
import { createDockerCollector } from './source';
import { BASE, clock, context, event, fakeDocker, frame } from './test-helpers';

describe('Docker Collector', () => {
  test('keeps inventory, health and log reads behind the Collector', async () => {
    const fake = fakeDocker();
    const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
    expect(collector.kind).toBe('collector');
    expect(await collector.listServices()).toEqual([
      { name: 'api', runtime: 'docker' },
      { name: 'worker', runtime: 'docker' },
    ]);
    expect(await collector.tailLogs('api', 1)).toEqual(['two']);
    expect(await collector.getHealth('worker')).toMatchObject({
      service: 'worker',
      status: 'healthy',
      checkedAt: clock.now(),
    });
    await expect(collector.tailLogs('missing', 1)).rejects.toBeInstanceOf(DockerSourceError);
  });

  test('publishes normalized observations, resumes with one cursor and tolerates failed delivery', async () => {
    const fake = fakeDocker([
      [event('oom', 100)],
      'fail',
      [
        event('oom', 100),
        event('die', 101, { exitCode: '137' }),
        event('health_status: unhealthy', 102),
      ],
    ]);
    const delivered = Promise.withResolvers<void>();
    let failed = false;
    const collected = context((envelope) => {
      if (envelope.type === 'runtime.unhealthy') delivered.resolve();
      if (envelope.type === 'runtime.restart' && !failed) {
        failed = true;
        throw new Error('failed subscriber');
      }
    });
    const delays: number[] = [];
    const collector = createDockerCollector({
      baseUrl: BASE,
      fetch: fake.fetchFn,
      clock,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    collector.start(collected.value);
    expect(() => collector.start(collected.value)).toThrow('already active');
    await delivered.promise;
    await collector.stop();
    const observations = collected.envelopes.filter((envelope) =>
      envelope.type.startsWith('runtime.'),
    );
    expect(observations.map((envelope) => envelope.type)).toEqual([
      'runtime.oom',
      'runtime.restart',
      'runtime.restart',
      'runtime.unhealthy',
    ]);
    expect(observations[0]).toMatchObject({
      id: 'project-1:local:docker:c1:100000000000:oom',
      projectId: 'project-1',
      service: 'api',
      source: 'collector.docker',
      observedAt: '1970-01-01T00:01:40.000Z',
      severity: 'critical',
    });
    for (const envelope of collected.envelopes) EventEnvelopeSchema.parse(envelope);
    expect(delays.slice(0, 2)).toEqual([500, 1000]);
    const watches = fake.requests.filter((url) => url.pathname === '/events');
    expect(watches[1]?.searchParams.get('since')).toBe('100');
    expect(watches[2]?.searchParams.get('since')).toBe('100');
    expect(fake.signals.every((signal) => signal.aborted)).toBe(true);
  });

  test('ignores normal exits and unknown events, and redacts observation payloads', async () => {
    const delivered = Promise.withResolvers<void>();
    const collected = context((envelope) => {
      if (envelope.type === 'runtime.oom') delivered.resolve();
    });
    const fake = fakeDocker([
      [
        event('start', 1),
        event('die', 2, { exitCode: '0' }),
        event('oom', 3, { name: 'ops@example.com' }),
      ],
    ]);
    const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
    collector.start(collected.value);
    await delivered.promise;
    await collector.stop();
    expect(
      collected.envelopes.filter((envelope) => envelope.type.startsWith('runtime.')),
    ).toHaveLength(1);
    expect(JSON.stringify(collected.envelopes)).not.toContain('ops@example.com');
  });

  test('fails closed before acquisition for bad or secret context fields', () => {
    const fake = fakeDocker();
    const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn });
    const collected = context();
    for (const projectId of ['bad project', 'AKIAIOSFODNN7EXAMPLE']) {
      expect(() => collector.start({ ...collected.value, projectId })).toThrow();
    }
    expect(fake.requests).toHaveLength(0);
  });

  test('rejects direct socket and non HTTP URLs', () => {
    for (const url of ['unix:///var/run/docker.sock', 'http://host/docker.sock', 'file:///x']) {
      expect(() => new DockerApi(url)).toThrow(DockerSourceError);
    }
  });

  test('demuxes real Docker frame layouts', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme-ascii' }), { maxLength: 6 }), (parts) => {
        expect(demuxLogs(Buffer.concat(parts.map(frame)))).toBe(parts.join(''));
      }),
    );
  });
});
