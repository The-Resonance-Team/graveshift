import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { caller, envelope } from './flow-fixtures';
import { setupFlow } from './flow.fixture';

type Flow = Awaited<ReturnType<typeof setupFlow>>;
const LATE = '2026-11-21T10:11:00.000Z';

/** The observation writes under this eventKey; a conflicting audit row blocks it. */
const writeKey = `haunting:${envelope.id}:detected:runtime.oom`;

async function blockWrite(flow: Flow) {
  await flow.platform.audit.append(caller.projectId, {
    key: writeKey,
    actor: 'other',
    type: 'haunting.recorded',
    payload: { view: {}, deploymentId: null },
  });
}

async function unblockWrite(flow: Flow) {
  await flow.db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.auditEntry.delete({
      where: { projectId_eventKey: { projectId: caller.projectId, eventKey: writeKey } },
    });
  });
}

describe.skipIf(!dbTestEnabled)('queued observation orchestration over Postgres', () => {
  const opened: Flow[] = [];
  const make = async (projects: string[] = [caller.projectId]) => {
    const flow = await setupFlow({ projects, seed: false });
    opened.push(flow);
    return flow;
  };
  const observe = async (flow: Flow) => flow.platform.observe(async () => {});
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((flow) => flow.close()));
  });

  test('a queued detection persists its Haunting, Diagnosis, and one Work item', async () => {
    const flow = await make();
    const process = await observe(flow);
    await process(envelope);
    expect(await flow.db.haunting.findFirstOrThrow()).toMatchObject({
      service: 'checkout',
      state: 'diagnosed',
    });
    expect(await flow.db.workItem.count()).toBe(1);
    const calls = flow.platform.models.length;
    expect(calls).toBeGreaterThan(0);
    await process(envelope);
    const restarted = await observe(flow);
    await restarted(envelope);
    expect(flow.platform.models).toHaveLength(calls);
    expect(await flow.db.workItem.count()).toBe(1);
  });

  test('a failed durable write retains the accepted outcome for redelivery', async () => {
    const flow = await make();
    // Real constraint: an eventKey conflict in the append-only audit chain rejects the write.
    await blockWrite(flow);
    await expect((await observe(flow))(envelope)).rejects.toThrow();
    expect(flow.platform.models).toHaveLength(0);
    await unblockWrite(flow);
    await (
      await observe(flow)
    )(envelope);
    expect(await flow.db.workItem.count()).toBe(1);
  });

  test('a lost Diagnosis response is reconciled before another model call', async () => {
    const flow = await make();
    let dropNext = false;
    // Boundary: drop one response after the real PrivateApi call has committed the write.
    const original = flow.platform.api.post.bind(flow.platform.api);
    const post = spyOn(flow.platform.api, 'post').mockImplementation(async (path, body, schema) => {
      const result = await original(path, body, schema);
      if (dropNext && path === '/internal/hauntings') {
        dropNext = false;
        throw new Error('Durable write committed but response was lost');
      }
      return result;
    });
    dropNext = true;
    await expect((await observe(flow))(envelope)).rejects.toThrow('response was lost');
    post.mockRestore();
    await (
      await observe(flow)
    )(envelope);
    expect(await flow.db.workItem.count()).toBe(1);
  });

  test('scope comes from each Event, while crew output cannot re-enter detection', async () => {
    const flow = await make([caller.projectId, 'project-2']);
    const process = await observe(flow);
    await process({ ...envelope, projectId: 'project-2' });
    const scopes = await flow.db.auditEntry.findMany({ select: { projectId: true } });
    expect([...new Set(scopes.map((row) => row.projectId))]).toEqual(['project-2']);
    await process({
      ...envelope,
      projectId: 'project-2',
      id: 'crew-output',
      type: 'diagnosis.ready',
    });
    expect(await flow.db.workItem.count()).toBe(1);
  });

  test('onWork receives the Project carried by the Event', async () => {
    const flow = await make([caller.projectId, 'project-2']);
    const bound: string[] = [];
    const process = await flow.platform.observe(async (_item, _incidentId, projectId) => {
      bound.push(projectId);
    });
    await process({ ...envelope, projectId: 'project-2' });
    expect(bound).toEqual(['project-2']);
  });

  test('a persisted closed Haunting releases its group for the next observation', async () => {
    const flow = await make();
    const process = await observe(flow);
    await process(envelope);
    const original = await flow.db.haunting.findFirstOrThrow();
    await flow.db.haunting.update({
      where: { projectId_id: { projectId: caller.projectId, id: original.id } },
      data: { state: 'resolved' },
    });
    await process({ ...envelope, id: 'new-haunting', observedAt: LATE });
    expect(await flow.db.haunting.count()).toBe(2);
    expect(await flow.db.workItem.count()).toBe(2);
  });

  test("a co-tenant event cannot reuse another Project's group", async () => {
    const flow = await make([caller.projectId, 'project-2']);
    const process = await observe(flow);
    await process(envelope);
    const original = await flow.db.haunting.findFirstOrThrow();
    await process({ ...envelope, id: 'other-project-event', projectId: 'project-2' });
    await flow.db.haunting.update({
      where: { projectId_id: { projectId: caller.projectId, id: original.id } },
      data: { state: 'resolved' },
    });
    await process({ ...envelope, id: 'fresh-observation', observedAt: LATE });
    const closed = await flow.db.haunting.findUniqueOrThrow({
      where: { projectId_id: { projectId: caller.projectId, id: original.id } },
    });
    expect(closed).toMatchObject({ state: 'resolved' });
    expect(await flow.db.haunting.count()).toBe(3);
  });
});
