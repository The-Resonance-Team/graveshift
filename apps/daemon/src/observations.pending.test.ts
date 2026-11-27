import { afterEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { BoundedCache } from './observations';
import { caller, envelope } from './flow-fixtures';
import { setupFlow } from './flow.fixture';

type Flow = Awaited<ReturnType<typeof setupFlow>>;
const LATE = '2026-11-21T10:11:00.000Z';

/** The eventKey each observation write would append; a conflicting row blocks it. */
const writeKey = (id: string) => `haunting:${id}:detected:runtime.oom`;

async function blockWrite(flow: Flow, id: string) {
  await flow.platform.audit.append(caller.projectId, {
    key: writeKey(id),
    actor: 'other',
    type: 'haunting.recorded',
    payload: { view: {}, deploymentId: null },
  });
}

async function unblockWrite(flow: Flow, id: string) {
  await flow.db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.auditEntry.delete({
      where: { projectId_eventKey: { projectId: caller.projectId, eventKey: writeKey(id) } },
    });
  });
}

describe.skipIf(!dbTestEnabled)('retained outcomes over Postgres', () => {
  const opened: Flow[] = [];
  const make = async () => {
    const flow = await setupFlow({ projects: [caller.projectId, 'project-2'], seed: false });
    opened.push(flow);
    return flow;
  };
  const observe = async (flow: Flow) => flow.platform.observe(async () => {});
  const activeCalls = (flow: Flow) =>
    flow.platform.responses.filter((row) => row.path === '/internal/hauntings/active').length;
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((flow) => flow.close()));
  });

  test('retained outcomes are scoped to the Project that ingested the Event', async () => {
    const flow = await make();
    const process = await observe(flow);
    await blockWrite(flow, 'shared-id');
    await expect(process({ ...envelope, id: 'shared-id' })).rejects.toThrow();
    expect(activeCalls(flow)).toBe(1);
    await process({
      ...envelope,
      id: 'shared-id',
      projectId: 'project-2',
      type: 'http.request',
      severity: 'warning',
    });
    expect(activeCalls(flow)).toBe(2);
    expect(await flow.db.haunting.count()).toBe(0);
  });

  test('failed outcomes are bounded and the oldest is evicted first', async () => {
    const flow = await make();
    const process = await observe(flow);
    const ids = Array.from({ length: 33 }, (_, index) => `overflow-${index}`);
    await ids.reduce((chain, id) => chain.then(() => blockWrite(flow, id)), Promise.resolve());
    await ids.reduce(
      (chain, id, index) =>
        chain.then(() =>
          expect(
            process({
              ...envelope,
              id,
              service: `svc-${index}`,
              traceId: `trace-${id}`,
            }),
          ).rejects.toThrow(),
        ),
      Promise.resolve(),
    );
    expect(activeCalls(flow)).toBe(33);
    await unblockWrite(flow, ids[0]!);
    await process({
      ...envelope,
      id: ids[0]!,
      service: 'svc-0',
      traceId: 'trace-retry',
    });
    expect(activeCalls(flow)).toBe(34);
  });

  test('stale retained outcomes are pruned before a later observation', async () => {
    const flow = await make();
    const process = await observe(flow);
    await blockWrite(flow, 'stale-event');
    await expect(process({ ...envelope, id: 'stale-event' })).rejects.toThrow();
    expect(activeCalls(flow)).toBe(1);
    await process({
      ...envelope,
      id: 'later-event',
      service: 'other',
      traceId: 'trace-later',
      observedAt: LATE,
    });
    expect(activeCalls(flow)).toBe(2);
    await unblockWrite(flow, 'stale-event');
    await process({ ...envelope, id: 'stale-event' });
    expect(activeCalls(flow)).toBe(3);
  });

  test('repeated terminal failures evict the retained outcome', async () => {
    const flow = await make();
    const process = await observe(flow);
    await blockWrite(flow, 'permanent');
    await [0, 1, 2].reduce(
      (chain) =>
        chain.then(() => expect(process({ ...envelope, id: 'permanent' })).rejects.toThrow()),
      Promise.resolve(),
    );
    expect(activeCalls(flow)).toBe(1);
    await unblockWrite(flow, 'permanent');
    await process({ ...envelope, id: 'permanent' });
    expect(activeCalls(flow)).toBe(2);
  });
});

describe('bounded cache mechanics', () => {
  test('an entry older than its age bound is pruned', () => {
    const cache = new BoundedCache<number>(4, 1000);
    cache.set('a', 1, 0);
    expect(cache.get('a', 1000)).toBe(1);
    expect(cache.get('a', 1001)).toBeUndefined();
  });

  test('the oldest entry is evicted at the cap', () => {
    const cache = new BoundedCache<number>(2, 1000);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('c', 3, 0);
    expect(cache.get('a', 0)).toBeUndefined();
    expect(cache.get('b', 0)).toBe(2);
    expect(cache.get('c', 0)).toBe(3);
  });

  test('re-setting an entry refreshes its FIFO position', () => {
    const cache = new BoundedCache<number>(2, 1000);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('a', 1, 1);
    cache.set('c', 3, 1);
    expect(cache.get('a', 1)).toBe(1);
    expect(cache.get('b', 1)).toBeUndefined();
  });

  test('Project-qualified keys stay in separate entries', () => {
    const cache = new BoundedCache<number>(2, 1000);
    cache.set(JSON.stringify(['project-1', 'incident']), 1, 0);
    cache.set(JSON.stringify(['project-2', 'incident']), 2, 0);
    expect(cache.get(JSON.stringify(['project-1', 'incident']), 0)).toBe(1);
    expect(cache.get(JSON.stringify(['project-2', 'incident']), 0)).toBe(2);
  });
});
