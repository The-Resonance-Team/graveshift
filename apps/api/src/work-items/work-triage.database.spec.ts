import { describe, expect, test } from 'bun:test';

import { dbTestEnabled, openTestDatabase } from '../../test/database/fixtures';
import { AuditRepo } from '../audit/audit.repo';
import { setupWorkDatabase, WORK_TEST_AGENTS, workCaller } from './testing/work-db.fixture';
import { WorkItemRepo } from './work-item.repo';

describe.skipIf(!dbTestEnabled)('Postgres pending triage command fencing', () => {
  const fixture = setupWorkDatabase();
  const command = { kind: 'triage' as const, body: { assignee: 'needs_agent_automatic' } };

  test.each(['needs_human', 'needs_agent_fixture'])(
    'an old automatic triage cannot replace the later %s assignment after a restart',
    async (assignee) => {
      await fixture.repo.saveTriage({
        caller: workCaller('automatic-command'),
        id: 'work-1',
        input: {
          expectedVersion: 0,
          body: command.body,
        },
      });
      await fixture.repo.saveTriage({
        caller: workCaller('later-command'),
        id: 'work-1',
        input: {
          expectedVersion: 1,
          body: { assignee },
        },
      });
      const fresh = await openTestDatabase();
      try {
        const restarted = new WorkItemRepo(fresh, new AuditRepo(fresh), WORK_TEST_AGENTS, {
          projectId: 'project-1',
        });
        await expect(
          restarted.saveTriage({
            caller: workCaller('automatic-command'),
            id: 'work-1',
            input: {
              expectedVersion: 0,
              body: command.body,
            },
          }),
        ).rejects.toMatchObject({ code: 'STATE_CHANGED', status: 409 });
        await expect(
          restarted.claim({
            caller: workCaller('automatic-command'),
            id: 'work-1',
            input: {
              expectedVersion: 2,
              command,
            },
          }),
        ).rejects.toMatchObject({ code: 'STATE_CHANGED', status: 409 });
        expect((await restarted.read({ projectId: 'project-1', id: 'work-1' })).item).toMatchObject(
          {
            assignee,
          },
        );
        expect(await fresh.fixAttempt.count()).toBe(0);
        const receipt = await fresh.workCommand.findUniqueOrThrow({
          where: {
            projectId_commandId: { projectId: 'project-1', commandId: 'automatic-command' },
          },
        });
        expect(receipt.workVersion).toBe(1);
      } finally {
        await fresh.onModuleDestroy();
      }
    },
  );

  test('a lost triage response can replay and claim when its saved version is still current', async () => {
    const input = { expectedVersion: 0, body: command.body };
    await fixture.repo.saveTriage({ caller: workCaller(), id: 'work-1', input: input });
    const replayed = await fixture.repo.saveTriage({
      caller: workCaller(),
      id: 'work-1',
      input: input,
    });
    expect(replayed).toMatchObject({ kind: 'saved', snapshot: { version: 1 } });
    const claim = await fixture.repo.claim({
      caller: workCaller(),
      id: 'work-1',
      input: { expectedVersion: 1, command },
    });
    expect(claim).toMatchObject({
      kind: 'claimed',
      attempt: { trigger: 'auto_fix', agent: 'automatic' },
    });
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });

  test('a newer assignment between pending replay and claim still blocks the old command', async () => {
    const input = { expectedVersion: 0, body: command.body };
    await fixture.repo.saveTriage({ caller: workCaller(), id: 'work-1', input: input });
    await fixture.repo.saveTriage({ caller: workCaller(), id: 'work-1', input: input });
    await fixture.repo.saveTriage({
      caller: workCaller('later-command'),
      id: 'work-1',
      input: {
        expectedVersion: 1,
        body: { assignee: 'needs_human' },
      },
    });
    await expect(
      fixture.repo.claim({
        caller: workCaller(),
        id: 'work-1',
        input: { expectedVersion: 1, command },
      }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED', status: 409 });
    expect((await fixture.read()).item.assignee).toBe('needs_human');
    expect(await fixture.db.fixAttempt.count()).toBe(0);
  });

  test('initial assignment version zero rejects a fresh daemon read after Human triage', async () => {
    await fixture.repo.saveTriage({
      caller: workCaller('human-command'),
      id: 'work-1',
      input: {
        expectedVersion: 0,
        body: { assignee: 'needs_human' },
      },
    });
    await expect(
      fixture.repo.saveTriage({
        caller: { ...workCaller('initial-command'), expectedVersion: 0 },
        id: 'work-1',
        input: {
          expectedVersion: 1,
          body: command.body,
        },
      }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED', status: 409 });
    expect((await fixture.read()).item.assignee).toBe('needs_human');
    expect(await fixture.db.fixAttempt.count()).toBe(0);
  });

  test('initial assignment pins only the save and retains that precondition in command identity', async () => {
    const caller = { ...workCaller(), expectedVersion: 0 };
    await fixture.repo.saveTriage({
      caller: caller,
      id: 'work-1',
      input: { expectedVersion: 0, body: command.body },
    });
    await expect(
      fixture.repo.replay({
        caller: { ...caller, expectedVersion: 1 },
        id: 'work-1',
        input: command,
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' });
    const claimed = await fixture.repo.claim({
      caller: caller,
      id: 'work-1',
      input: { expectedVersion: 1, command },
    });
    expect(claimed).toMatchObject({ kind: 'claimed', attempt: { trigger: 'auto_fix' } });
  });
});
