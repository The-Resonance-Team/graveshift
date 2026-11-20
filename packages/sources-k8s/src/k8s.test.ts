import { describe, expect, test } from 'bun:test';
import { type RuntimeEvent, type Signal, SignalSchema } from '@graveshift/core';
import { runRuntimeSourceContract } from '@graveshift/core/contract';
import fc from 'fast-check';

import { mapK8sEvent, serviceOf } from './map';
import { createK8sSource } from './source';
import { type DeploymentInfo, type K8sEvent, type KubeApi, WatchExpiredError } from './types';
import { backoffMs } from './watch';

const deployments: DeploymentInfo[] = [
  { name: 'api', namespace: 'candy-shop', replicas: 2, ready: 2, selector: { app: 'api' } },
  { name: 'worker', namespace: 'candy-shop', replicas: 1, ready: 0, selector: { app: 'worker' } },
  { name: 'coredns', namespace: 'kube-system', replicas: 1, ready: 1, selector: {} },
];

const fixture = (over: Partial<K8sEvent>, n = 1): K8sEvent => ({
  uid: `uid-${n}`,
  reason: 'BackOff',
  message: 'Back-off restarting failed container worker in pod worker-5d8f9c7b6d-x2k4q',
  type: 'Warning',
  namespace: 'candy-shop',
  involvedKind: 'Pod',
  involvedName: 'worker-5d8f9c7b6d-x2k4q',
  resourceVersion: String(100 + n),
  at: '2026-11-20T10:00:00.000Z',
  ...over,
});

interface Script {
  streams: Array<K8sEvent[] | Error>;
  versions: string[];
  oom?: boolean;
}

function fakeApi(script: Script = { streams: [], versions: [] }): KubeApi {
  let connection = 0;
  return {
    listDeployments: async () => deployments,
    podNames: async () => ['api-5d8f9c7b6d-x2k4q'],
    podOomKilled: async () => script.oom ?? false,
    readLog: async () => 'one\ntwo\nthree\n',
    latestEventVersion: async () => '100',
    async watchEvents(resourceVersion, onEvent, _signal, onOpen) {
      script.versions.push(resourceVersion);
      const next = script.streams[connection++] ?? [];
      if (next instanceof Error) throw next;
      onOpen();
      for (const event of next) onEvent(event);
    },
  };
}

runRuntimeSourceContract('k8s', () => createK8sSource({ api: fakeApi() }));

describe('k8s event mapping (fixtures)', () => {
  const cases: Array<[Partial<K8sEvent>, Signal['kind'] | null]> = [
    [{}, 'crash_loop'],
    [
      {
        reason: 'OOMKilling',
        message: 'Memory cgroup out of memory: Killed process 1 (bun)',
        involvedKind: 'Node',
        involvedName: 'kind-worker',
      },
      'oom',
    ],
    [{ reason: 'Failed', message: 'Error: ErrImagePull' }, 'image_pull_backoff'],
    [
      { reason: 'BackOff', message: 'Back-off pulling image "ghcr.io/x/api:ghost"' },
      'image_pull_backoff',
    ],
    [
      {
        reason: 'Unhealthy',
        message: 'Readiness probe failed: HTTP probe failed with statuscode: 503',
      },
      'unhealthy',
    ],
    [
      { reason: 'Killing', message: 'Container api failed liveness probe, will be restarted' },
      'restart',
    ],
    [{ reason: 'Pulled', type: 'Normal', message: 'ok' }, null],
    [{ type: 'Normal' }, null],
  ];
  for (const [over, kind] of cases) {
    test(`${over.reason ?? 'BackOff'} ${over.message?.slice(0, 24) ?? ''} -> ${kind}`, () => {
      const signal = mapK8sEvent(fixture(over));
      expect(signal?.kind ?? null).toBe(kind);
      if (signal) SignalSchema.parse(signal);
    });
  }

  test('pod names map back to their deployment', () => {
    expect(serviceOf(fixture({}))).toBe('worker');
    expect(serviceOf(fixture({ involvedKind: 'Deployment', involvedName: 'api' }))).toBe('api');
  });
});

describe('k8s source', () => {
  test('skips kube-* namespaces and reports readiness', async () => {
    const source = createK8sSource({ api: fakeApi() });
    expect((await source.listServices()).map((s) => s.name)).toEqual(['api', 'worker']);
    expect((await source.getHealth('api')).status).toBe('healthy');
    expect((await source.getHealth('worker')).status).toBe('unhealthy');
    expect(await source.tailLogs('api', 2)).toEqual(['two', 'three']);
  });

  test('resumes from the last resourceVersion, relists after 410, and enriches crash loops with OOM', async () => {
    const script: Script = {
      versions: [],
      oom: true,
      streams: [
        [fixture({}, 1)],
        new WatchExpiredError(),
        [fixture({ reason: 'Unhealthy', message: 'Readiness probe failed' }, 2)],
      ],
    };
    const received: RuntimeEvent[] = [];
    const delays: number[] = [];
    const source = createK8sSource({
      api: fakeApi(script),
      sleep: async (ms) => void delays.push(ms),
    });
    const done = Promise.withResolvers<void>();
    const stop = await source.watchEvents((e) => {
      received.push(e);
      if (e.kind === 'signal' && e.signal.kind === 'unhealthy') done.resolve();
    });
    await done.promise;
    stop();
    const kinds = received.map((e) => (e.kind === 'signal' ? e.signal.kind : e.kind));
    expect(kinds).toEqual(
      expect.arrayContaining(['crash_loop', 'oom', 'source_disconnected', 'unhealthy']),
    );
    expect(script.versions).toEqual(['100', '101', '100']);
    expect(delays[0]).toBe(500);
  });
});

describe('properties', () => {
  test('backoff is capped and monotone', () => {
    fc.assert(
      fc.property(fc.nat(100), (n) => {
        expect(backoffMs(n)).toBeLessThanOrEqual(30_000);
        expect(backoffMs(n + 1)).toBeGreaterThanOrEqual(backoffMs(n));
      }),
    );
  });

  test('every mapped event is a valid Signal whose fingerprint names its service', () => {
    const reasons = [
      'BackOff',
      'Failed',
      'Unhealthy',
      'Killing',
      'OOMKilling',
      'ErrImagePull',
      'Pulled',
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...reasons),
        fc.constantFrom(
          'Back-off restarting failed container',
          'Back-off pulling image',
          'ErrImagePull',
          'failed liveness probe',
          'x',
        ),
        fc.constantFrom('Warning', 'Normal'),
        (reason, message, type) => {
          const signal = mapK8sEvent(fixture({ reason, message, type }));
          if (!signal) return;
          SignalSchema.parse(signal);
          expect(signal.fingerprint.startsWith(`${signal.service}:`)).toBe(true);
          expect(type).toBe('Warning');
        },
      ),
    );
  });
});
