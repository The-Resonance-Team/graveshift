import { KubeConfig, Watch } from '@kubernetes/client-node';
import { expect, spyOn, test } from 'bun:test';

import { createKubeApi } from './kube-api';
import { WatchExpiredError, type K8sEvent } from './types';

function config() {
  const value = new KubeConfig();
  value.loadFromOptions({
    clusters: [{ name: 'test', server: 'http://unused.invalid' }],
    users: [{ name: 'test' }],
    contexts: [{ name: 'test', cluster: 'test', user: 'test' }],
    currentContext: 'test',
  });
  return value;
}

test('real watch adapter handles JSON timestamps and skips malformed event frames', async () => {
  const controller = new AbortController();
  const watch = spyOn(Watch.prototype, 'watch').mockImplementation(
    async (_path, _query, emit, done) => {
      emit('ADDED', { metadata: { uid: 'bad' } });
      emit('MODIFIED', {
        metadata: {
          uid: 'uid-1',
          resourceVersion: '101',
          namespace: 'shop',
          creationTimestamp: '2026-11-20T09:00:00.000Z',
        },
        involvedObject: { kind: 'Pod', name: 'api-5d8f9c7b6d-x2k4q' },
        lastTimestamp: '2026-11-20T10:00:00.000Z',
        eventTime: null,
        reason: 'Unhealthy',
        type: 'Warning',
        message: 'Readiness probe failed',
      });
      done(null);
      return controller;
    },
  );
  try {
    const events: K8sEvent[] = [];
    await createKubeApi(config()).watchEvents(
      '100',
      (event) => events.push(event),
      new AbortController().signal,
      () => {},
    );
    expect(events).toEqual([
      {
        uid: 'uid-1',
        resourceVersion: '101',
        namespace: 'shop',
        involvedKind: 'Pod',
        involvedName: 'api-5d8f9c7b6d-x2k4q',
        at: '2026-11-20T10:00:00.000Z',
        reason: 'Unhealthy',
        type: 'Warning',
        message: 'Readiness probe failed',
      },
    ]);
    expect(controller.signal.aborted).toBe(true);
  } finally {
    watch.mockRestore();
  }
});

test('real watch adapter treats an ERROR frame with code 410 as an expired cursor', async () => {
  const controller = new AbortController();
  const watch = spyOn(Watch.prototype, 'watch').mockImplementation(async (_path, _query, emit) => {
    emit('ERROR', {
      kind: 'Status',
      apiVersion: 'v1',
      status: 'Failure',
      reason: 'Expired',
      code: 410,
    });
    return controller;
  });
  try {
    await expect(
      createKubeApi(config()).watchEvents(
        '100',
        () => {},
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toBeInstanceOf(WatchExpiredError);
    expect(controller.signal.aborted).toBe(true);
  } finally {
    watch.mockRestore();
  }
});
