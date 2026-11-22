import { KubeConfig, Watch } from '@kubernetes/client-node';
import { expect, spyOn, test } from 'bun:test';

import { createKubeApi } from './kube-api';
import { createK8sCollector } from './source';
import { clock, context, fakeApi, fixture } from './test-helpers';

test('stop flushes OOM enrichment and retained later observations within its deadline', async () => {
  const lookup = Promise.withResolvers<boolean>();
  const entered = Promise.withResolvers<void>();
  const fake = fakeApi([[fixture(), fixture({ uid: 'uid-2', reason: 'Unhealthy' })]]);
  fake.api.podOomKilled = () => {
    entered.resolve();
    return lookup.promise;
  };
  const collected = context();
  const collector = createK8sCollector({ api: fake.api, clock });
  collector.start(collected.value);
  await entered.promise;
  let stopped = false;
  const stopping = Promise.resolve(collector.stop()).then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  lookup.resolve(true);
  await stopping;
  expect(collected.envelopes.map((envelope) => envelope.type)).toEqual([
    'runtime.crash_loop',
    'runtime.oom',
    'runtime.unhealthy',
  ]);
});

test('stop waits for pending publication and restart resumes only its own cursor', async () => {
  const delivered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const fake = fakeApi([[fixture({ reason: 'Unhealthy' })]]);
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    collected.envelopes.push(envelope);
    delivered.resolve();
    await release.promise;
  };
  const collector = createK8sCollector({ api: fake.api, clock });
  collector.start(collected.value);
  await delivered.promise;
  let stopped = false;
  const stopping = Promise.resolve(collector.stop()).then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  release.resolve();
  await stopping;
  collector.start(collected.value);
  await collector.stop();
  expect(fake.versions).toEqual(['100', '101']);
  expect(collected.envelopes.map((envelope) => envelope.type)).toEqual(['runtime.unhealthy']);
});

test('stop during initial version acquisition prevents a later watch', async () => {
  const version = Promise.withResolvers<string>();
  const fake = fakeApi();
  fake.api.latestEventVersion = () => version.promise;
  const collector = createK8sCollector({ api: fake.api, clock });
  collector.start(context().value);
  const stopping = collector.stop();
  version.resolve('100');
  await stopping;
  expect(fake.versions).toHaveLength(0);
});

test('real Kubernetes adapter aborts a controller returned after stop during acquisition', async () => {
  const config = new KubeConfig();
  config.loadFromOptions({
    clusters: [{ name: 'test', server: 'http://unused.invalid' }],
    users: [{ name: 'test' }],
    contexts: [{ name: 'test', cluster: 'test', user: 'test' }],
    currentContext: 'test',
  });
  const acquired = Promise.withResolvers<AbortController>();
  const controller = new AbortController();
  const watcher = spyOn(Watch.prototype, 'watch').mockImplementation(() => acquired.promise);
  try {
    const api = createKubeApi(config);
    const lifetime = new AbortController();
    let opened = false;
    const watching = api.watchEvents(
      '100',
      () => {
        throw new Error('late event');
      },
      lifetime.signal,
      () => {
        opened = true;
      },
    );
    lifetime.abort();
    acquired.resolve(controller);
    await watching;
    expect(controller.signal.aborted).toBe(true);
    expect(opened).toBe(false);
  } finally {
    watcher.mockRestore();
  }
});
