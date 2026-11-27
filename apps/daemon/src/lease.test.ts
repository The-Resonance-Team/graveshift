import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkError } from '@graveshift/work';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { setupFlow } from './flow.fixture';
import { caller } from './flow-fixtures';

describe.skipIf(!dbTestEnabled)('Fix attempt execution ownership', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  beforeEach(async () => {
    flow = await setupFlow();
  });
  afterEach(async () => {
    await flow?.close();
  });

  test('a duplicate command cannot abandon a live worker or run a second model call', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const execute = flow.options.execute;
    flow.options.execute = async (input) => {
      entered.resolve();
      await release.promise;
      return execute(input);
    };
    const pending = flow.commands({ workerId: 'live-worker' }).fixNow(caller, 'work-1', {});
    await entered.promise;
    await expect(
      flow.commands({ workerId: 'other-worker' }).fixNow(caller, 'work-1', {}),
    ).rejects.toMatchObject({ code: 'LEASE_ACTIVE' });
    expect((await flow.read()).activeAttempt?.workerId).toBe('live-worker');
    release.resolve();
    expect(await pending).toMatchObject({ ok: true });
    expect(flow.platform.models).toHaveLength(1);
  });

  test.each(['claimed', 'running'] as const)(
    'an expired %s attempt is durably failed on replay without another model call',
    async (state) => {
      const snapshot = await flow.read();
      const claim = await flow.options.runtime.claim(
        { ...caller, workerId: 'lost-worker' },
        'work-1',
        { expectedVersion: snapshot.version, command: { kind: 'fix_now', body: {} } },
      );
      if (claim.kind !== 'claimed') throw new Error('Expected claim');
      await flow.db.fixAttempt.update({
        where: { id: claim.attempt.id },
        data: { state, leaseUntil: new Date('2020-01-01T00:00:00.000Z') },
      });
      const restarted = flow.commands({ workerId: 'new-worker' });
      const result = await restarted.fixNow(caller, 'work-1', {});
      expect(result).toMatchObject({
        ok: false,
        failure: 'fix_error',
        attemptId: claim.attempt.id,
      });
      expect((await flow.read()).activeAttempt).toBeUndefined();
      expect(await restarted.fixNow(caller, 'work-1', {})).toEqual(result);
      expect(flow.platform.models).toEqual([]);
      expect(flow.platform.recording.writes).toEqual([]);
    },
  );

  test('a rejected heartbeat stops before context, source, model, and publication', async () => {
    flow.options.runtime.heartbeat = async () => ({ renewed: false });
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'LEASE_EXPIRED',
    });
    expect(flow.platform.models).toEqual([]);
    expect(flow.platform.recording.writes).toEqual([]);
    expect(flow.calls).not.toContain('finish');
  });

  test('a failed lease renewal propagates rather than being treated as an assignment change', async () => {
    flow.options.runtime.heartbeat = async () => {
      throw new WorkError('WORKER_CHANGED', 'Owner changed');
    };
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'LEASE_EXPIRED',
    });
    expect(await flow.db.fixAttempt.findFirstOrThrow()).toMatchObject({ state: 'claimed' });
  });
});
