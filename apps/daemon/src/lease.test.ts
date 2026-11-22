import { WorkError } from '@graveshift/work';
import { describe, expect, test } from 'bun:test';

import { caller } from './flow-fixtures';
import { harness } from './flow-harness';
import { createWorkCommands } from './work-flow';

describe('Fix attempt execution ownership', () => {
  test('a duplicate command cannot abandon a live worker or run a second model call', async () => {
    const flow = harness();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const execute = flow.options.execute;
    flow.options.execute = async (input) => {
      entered.resolve();
      await release.promise;
      return execute(input);
    };
    const commands = createWorkCommands({ ...flow.options, workerId: 'live-worker' });
    const pending = commands.fixNow(caller, 'work-1', {});
    await entered.promise;
    await expect(
      createWorkCommands({ ...flow.options, workerId: 'other-worker' }).fixNow(
        caller,
        'work-1',
        {},
      ),
    ).rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' });
    expect(flow.runtime.snapshot.activeAttempt?.workerId).toBe('live-worker');
    release.resolve();
    expect(await pending).toMatchObject({ ok: true });
    expect(flow.requests).toHaveLength(1);
  });

  test.each(['claimed', 'running'] as const)(
    'an expired %s attempt is durably failed on replay without another model call',
    async (state) => {
      const flow = harness();
      const claim = await flow.runtime.claim({ ...caller, workerId: 'lost-worker' }, 'work-1', {
        expectedVersion: 0,
        command: { kind: 'fix_now', body: {} },
      });
      if (claim.kind !== 'claimed') throw new Error('Expected claim');
      flow.runtime.snapshot.activeAttempt = { ...claim.attempt, state };
      flow.runtime.expired = true;
      const restarted = createWorkCommands({ ...flow.options, workerId: 'new-worker' });
      const result = await restarted.fixNow(caller, 'work-1', {});
      expect(result).toMatchObject({
        ok: false,
        failure: 'fix_error',
        attemptId: claim.attempt.id,
      });
      expect(flow.runtime.snapshot.activeAttempt).toBeUndefined();
      expect(await restarted.fixNow(caller, 'work-1', {})).toEqual(result);
      expect(flow.requests).toEqual([]);
      expect(flow.effects).toEqual([]);
    },
  );

  test('a rejected heartbeat stops before context, source, model, and publication', async () => {
    const flow = harness();
    flow.runtime.heartbeat = async () => ({ renewed: false });
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'LEASE_EXPIRED',
    });
    expect(flow.effects).toEqual([]);
    expect(flow.requests).toEqual([]);
    expect(flow.runtime.calls).not.toContain('finish');
  });

  test('a failed lease renewal propagates rather than being treated as an assignment change', async () => {
    const flow = harness();
    flow.runtime.heartbeat = async () => {
      throw new WorkError('WORKER_CHANGED', 'Owner changed');
    };
    await expect(flow.commands().fixNow(caller, 'work-1', {})).rejects.toMatchObject({
      code: 'LEASE_EXPIRED',
    });
    expect(flow.runtime.snapshot.activeAttempt?.state).toBe('claimed');
  });
});
