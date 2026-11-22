import { type K8sEvent, type KubeApi, WatchExpiredError } from '@graveshift/sources-k8s';
import { EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createK8sCollector } from './k8s';
import { failures, hangingSleep, makeContext, rejectingPublisher, flush } from './test-helpers';

const pod = 'api-6f7b9c8d5d-x2k4q';

const k8sEvent = (over: Partial<K8sEvent> & { uid: string; reason: string }): K8sEvent => ({
  type: 'Warning',
  message: `${over.reason} happened`,
  namespace: 'prod',
  involvedKind: 'Pod',
  involvedName: pod,
  at: '2026-11-22T09:59:00.000Z',
  ...over,
  resourceVersion: over.resourceVersion ?? '1',
});

const warningEvents = (): K8sEvent[] => [
  k8sEvent({ uid: 'e1', reason: 'OOMKilling', message: 'System OOM encountered' }),
  k8sEvent({
    uid: 'e2',
    reason: 'BackOff',
    message: 'Back-off restarting failed container',
  }),
  k8sEvent({ uid: 'e3', reason: 'Unhealthy', message: 'Liveness probe failed' }),
  k8sEvent({ uid: 'e4', reason: 'ImagePullBackOff', message: 'Failed to pull image' }),
  // skipped: normal type, other grave, duplicate uid and resourceVersion
  k8sEvent({ uid: 'e5', reason: 'Scheduled', type: 'Normal' }),
  k8sEvent({ uid: 'e6', reason: 'OOMKilling', involvedName: 'worker-7d9f8c6b5d-p3n4r' }),
  k8sEvent({ uid: 'e2', reason: 'BackOff', message: 'Back-off restarting failed container' }),
];

interface FakeApiOptions {
  batches: K8sEvent[][];
  oomKilled?: string[];
  onCall?: (name: string) => void;
  failFirstWith?: Error;
}

/** A fake kube surface: delivers queued event batches, then waits for the abort signal. */
function fakeApi(options: FakeApiOptions): KubeApi {
  let connection = 0;
  const waitAborted = (signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    });

  return {
    async listDeployments() {
      options.onCall?.('listDeployments');
      return [];
    },
    async podNames() {
      options.onCall?.('podNames');
      return [];
    },
    async podOomKilled(_namespace, podName) {
      options.onCall?.(`podOomKilled:${podName}`);
      return options.oomKilled?.includes(podName) ?? false;
    },
    async readLog() {
      options.onCall?.('readLog');
      return '';
    },
    async latestEventVersion() {
      options.onCall?.('latestEventVersion');
      return '100';
    },
    async watchEvents(resourceVersion, onEvent, signal, onOpen) {
      options.onCall?.(`watchEvents:${resourceVersion}`);
      if (options.failFirstWith && connection === 0) {
        connection += 1;
        throw options.failFirstWith;
      }
      const batch = options.batches[Math.min(connection, options.batches.length - 1)] ?? [];
      connection += 1;
      for (const event of batch) onEvent(event);
      onOpen();
      await waitAborted(signal);
    },
  };
}

async function startedCollector(
  options: FakeApiOptions,
  sleepOverride?: (ms: number, signal: AbortSignal) => Promise<void>,
) {
  const setup = makeContext();
  const warnings: string[] = [];
  const { sleep, delays } = hangingSleep();
  const collector = createK8sCollector({
    api: fakeApi(options),
    sleep: sleepOverride ?? sleep,
    warn: (m) => warnings.push(m),
  });
  await collector.start(setup.context);
  await flush();
  return { ...setup, collector, warnings, delays };
}

describe('kubernetes collector', () => {
  test('publishes one valid envelope per observation for the grave only', async () => {
    const { collector, publisher, warnings } = await startedCollector({
      batches: [warningEvents()],
      oomKilled: [pod],
    });

    expect(warnings).toEqual([]);
    const envelopes = publisher.envelopes;
    for (const envelope of envelopes)
      expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(
      envelopes.map((e) => [e.source, e.service, e.projectId, e.type, e.severity, e.fingerprint]),
    ).toEqual([
      ['collector.kubernetes', 'api', 'project-1', 'runtime.oom', 'critical', 'api:oom'],
      [
        'collector.kubernetes',
        'api',
        'project-1',
        'runtime.restart-loop',
        'critical',
        'api:crash_loop',
      ],
      ['collector.kubernetes', 'api', 'project-1', 'runtime.unhealthy', 'warning', 'api:unhealthy'],
      [
        'collector.kubernetes',
        'api',
        'project-1',
        'k8s.image-pull',
        'warning',
        'api:image_pull_backoff',
      ],
      // best-effort enrichment runs last: the crash_loop pod was OOMKilled
      ['collector.kubernetes', 'api', 'project-1', 'runtime.oom', 'critical', 'api:oom'],
    ]);
    expect(envelopes.map((e) => e.id)).toEqual([
      'k8s:e1:1',
      'k8s:e2:1',
      'k8s:e3:1',
      'k8s:e4:1',
      'k8s:e2:1:oom',
    ]);
    expect(envelopes[0]?.payload).toMatchObject({
      namespace: 'prod',
      involvedName: pod,
      reason: 'OOMKilling',
    });
    await collector.stop();
  });

  test('redacts secrets in the message payload', async () => {
    const { collector, publisher } = await startedCollector({
      batches: [
        [
          k8sEvent({
            uid: 'e9',
            reason: 'Unhealthy',
            message: 'probe got Authorization: Bearer abcdefghijklmnop',
          }),
        ],
      ],
    });
    const [envelope] = publisher.envelopes;
    expect(envelope?.payload?.message).toContain('[REDACTED:bearer]');
    await collector.stop();
  });

  test('recovers from a gone watch and replays from a fresh version', async () => {
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
    const { collector, publisher, warnings } = await startedCollector(
      { batches: [[], warningEvents()], failFirstWith: new WatchExpiredError(), oomKilled: [pod] },
      sleep,
    );
    await flush();
    await flush();
    expect(publisher.envelopes).toHaveLength(5);
    // the failed connect is reported to warn, not to the envelope stream
    expect(warnings).toContain(
      'kubernetes source disconnected: resourceVersion too old (410 Gone)',
    );
    expect(failures(warnings)).toEqual([]);
    await collector.stop();
  });

  test('fail closed: start rejects a bad context before any read', async () => {
    const calls: string[] = [];
    const publisher = makeContext().publisher;
    const collector = createK8sCollector({
      api: fakeApi({ batches: [[]], onCall: (name) => calls.push(name) }),
    });

    expect(() => collector.start(undefined as never)).toThrow('object');
    expect(() =>
      collector.start({ publisher: {} as never, projectId: 'p', service: 'api' }),
    ).toThrow('publisher');
    expect(() => collector.start({ publisher, projectId: 'bad project', service: 'api' })).toThrow(
      'projectId',
    );
    expect(() => collector.start({ publisher, projectId: 'p', service: '' })).toThrow('service');
    expect(calls).toEqual([]);
    expect(publisher.envelopes).toHaveLength(0);
    await collector.stop();
  });

  test('fail open: a rejected publish is reported and the watch continues', async () => {
    const publisher = rejectingPublisher(2);
    const { context } = makeContext({ publisher });
    const warnings: string[] = [];
    const { sleep } = hangingSleep();
    const collector = createK8sCollector({
      api: fakeApi({ batches: [warningEvents()], oomKilled: [pod] }),
      sleep,
      warn: (m) => warnings.push(m),
    });
    await collector.start(context);
    await flush();

    expect(publisher.attempted).toHaveLength(5);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('nats unavailable');
    await collector.stop();
  });

  test('fail open: a failing enrichment never disturbs the crash_loop observation', async () => {
    const api = fakeApi({
      batches: [
        [
          k8sEvent({
            uid: 'e2',
            reason: 'BackOff',
            message: 'Back-off restarting failed container',
          }),
        ],
      ],
    });
    api.podOomKilled = async () => {
      throw new Error('kube api down');
    };
    const { collector, publisher, warnings } = await startedCollector2(api);
    expect(publisher.envelopes).toHaveLength(1);
    expect(publisher.envelopes[0]?.type).toBe('runtime.restart-loop');
    // the enrichment error is reported to warn; the crash_loop observation stays published
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'kubernetes oom enrichment failed for pod prod/api-6f7b9c8d5d-x2k4q',
    );
    expect(warnings[0]).toContain('kube api down');
    await collector.stop();
  });

  test('fail closed: a second start is rejected until stop runs', async () => {
    const collector = createK8sCollector({ api: fakeApi({ batches: [[]] }) });
    await collector.start(makeContext().context);
    expect(() => collector.start(makeContext().context)).toThrow(
      'kubernetes collector is already started',
    );
    await collector.stop();
    await collector.start(makeContext().context);
    await collector.stop();
  });

  test('stop ends the loop and a second stop is a no-op', async () => {
    const { collector, publisher } = await startedCollector({ batches: [warningEvents()] });
    await collector.stop();
    await collector.stop();
    const before = publisher.envelopes.length;
    await flush();
    expect(publisher.envelopes).toHaveLength(before);
  });
});

/** start with an already built fake api */
async function startedCollector2(api: KubeApi) {
  const setup = makeContext();
  const warnings: string[] = [];
  const { sleep } = hangingSleep();
  const collector = createK8sCollector({
    api,
    sleep,
    warn: (m) => warnings.push(m),
  });
  await collector.start(setup.context);
  await flush();
  return { ...setup, collector, warnings };
}
