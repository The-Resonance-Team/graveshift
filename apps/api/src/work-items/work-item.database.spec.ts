import { WorkError } from '@graveshift/work';
import { describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled, openTestDatabase } from '../../test/database/fixtures';
import { AuditRepo } from '../audit/audit.repo';
import {
  attemptFence,
  setupWorkDatabase,
  WORK_TEST_AGENTS,
  workCaller,
} from './testing/work-db.fixture';
import { WorkItemRepo } from './work-item.repo';
import { testProjectGrant } from '../internal/testing/project-grant.fixture';

describe.skipIf(!dbTestEnabled)('Postgres WorkItemRepo admission', () => {
  const fixture = setupWorkDatabase();

  test('a new client reads stored work and verified Diagnosis after a restart', async () => {
    const diagnosis = {
      id: 'diagnosis-1',
      incidentId: 'incident-1',
      rootCause: 'Memory limit',
      evidence: [{ ref: 'event-1', excerpt: 'OOM' }],
      confidence: 0.95,
      createdAt: '2026-11-21T00:00:00.000Z',
    };
    await fixture.db.workItem.update({ where: { id: 'work-1' }, data: { diagnosis } });
    const fresh = await openTestDatabase();
    try {
      const restarted = new WorkItemRepo(
        fresh,
        new AuditRepo(fresh),
        WORK_TEST_AGENTS,
        testProjectGrant(['project-1']),
      );
      expect(await restarted.read({ projectId: 'project-1', id: 'work-1' })).toMatchObject({
        item: { id: 'work-1', diagnosisRef: 'diagnosis-1' },
        diagnosis,
        version: 0,
      });
      await expect(restarted.read({ projectId: 'project-1', id: 'missing' })).rejects.toMatchObject(
        {
          code: 'WORK_NOT_FOUND',
          status: 404,
        },
      );
      await expect(restarted.read({ projectId: 'project-2', id: 'work-1' })).rejects.toMatchObject({
        code: 'PROJECT_FORBIDDEN',
        status: 403,
      });
    } finally {
      await fresh.onModuleDestroy();
    }
  });

  test('filters in Postgres and pages by fixPriority, title, then ID', async () => {
    await fixture.seed({
      id: 'work-2',
      title: 'A',
      fixPriority: 2,
      service: 'api',
      priority: 'high',
    });
    await fixture.seed({
      id: 'work-3',
      title: 'A',
      fixPriority: 2,
      service: 'api',
      priority: 'high',
    });
    await fixture.seed({
      id: 'work-4',
      title: 'B',
      fixPriority: 1,
      service: 'api',
      priority: 'high',
    });
    const page = await fixture.repo.list('project-1', {
      offset: 1,
      limit: 1,
      service: 'api',
      priority: 'high',
      status: 'todo',
      severity: 'warning',
      assignee: 'needs_agent_fixture',
    });
    expect(page).toMatchObject({ total: 3, offset: 1, limit: 1 });
    expect(page.items.map((item) => item.id)).toEqual(['work-2']);
  });

  test('two competing commands admit one durable claim and return 409 for the other', async () => {
    const input = { expectedVersion: 0, command: { kind: 'fix_now' as const, body: {} } };
    const outcomes = await Promise.allSettled([
      fixture.repo.claim({ caller: workCaller('first'), id: 'work-1', input: input }),
      fixture.repo.claim({ caller: workCaller('second'), id: 'work-1', input: input }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === 'rejected');
    if (!rejection || rejection.status !== 'rejected') throw new Error('Expected one conflict');
    expect(rejection.reason).toBeInstanceOf(WorkError);
    expect(rejection.reason.status).toBe(409);
    expect(await fixture.db.fixAttempt.count()).toBe(1);
    expect(await fixture.db.workCommand.count()).toBe(1);
    expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('Human assignment and completed Work items block claims before a durable effect', async () => {
    await fixture.db.workItem.update({
      where: { id: 'work-1' },
      data: { assignee: 'needs_human' },
    });
    await expect(fixture.claim()).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT', status: 403 });
    await fixture.db.workItem.update({ where: { id: 'work-1' }, data: { status: 'done' } });
    await expect(
      fixture.repo.saveTriage({
        caller: workCaller(),
        id: 'work-1',
        input: {
          expectedVersion: 0,
          body: { assignee: 'needs_agent_fixture' },
        },
      }),
    ).rejects.toMatchObject({ code: 'TERMINAL_STATUS', status: 409 });
    expect(await fixture.db.fixAttempt.count()).toBe(0);
    expect(await fixture.db.auditEntry.count()).toBe(0);
  });

  test('Agent autoFix controls triage admission and failed auto-fix retains triage', async () => {
    const caller = workCaller();
    const command = { kind: 'triage' as const, body: { assignee: 'needs_agent_automatic' } };
    const saved = await fixture.repo.saveTriage({
      caller: caller,
      id: 'work-1',
      input: {
        expectedVersion: 0,
        body: command.body,
      },
    });
    expect(saved.kind).toBe('saved');
    expect((await fixture.read()).item).toMatchObject({
      assignee: 'needs_agent_automatic',
    });
    await expect(fixture.claim(workCaller('explicit'))).rejects.toMatchObject({
      code: 'FIX_NOW_DISABLED',
    });
    await fixture.repo.claim({
      caller: caller,
      id: 'work-1',
      input: { expectedVersion: 1, command },
    });
    const finished = await fixture.repo.finish({
      caller: caller,
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        state: 'failed',
        outcome: {
          ok: false,
          effect: 'deny',
          failure: 'fix_error',
          reason: 'fix_failed',
          pr: null,
          routing: null,
        },
      },
    });
    expect(finished.item.assignee).toBe('needs_agent_automatic');
    const replay = await fixture.repo.replay({ caller: caller, id: 'work-1', input: command });
    expect(replay).toMatchObject({
      kind: 'triage',
      result: { item: { assignee: 'needs_agent_automatic' }, autoFix: { failure: 'fix_error' } },
    });
    await expect(
      fixture.repo.replay({
        caller: caller,
        id: 'work-1',
        input: { kind: 'triage', body: { assignee: 'needs_human' } },
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' });
  });

  test('Human triage disables auto-fix and replays without rewriting its version', async () => {
    const input = { expectedVersion: 0, body: { assignee: 'needs_human' } };
    await fixture.repo.saveTriage({ caller: workCaller(), id: 'work-1', input: input });
    const replay = await fixture.repo.saveTriage({
      caller: workCaller(),
      id: 'work-1',
      input: input,
    });
    expect(replay).toMatchObject({
      kind: 'replay',
      outcome: { kind: 'triage', result: { autoFix: null } },
    });
    expect((await fixture.read()).version).toBe(1);
    expect(await fixture.db.fixAttempt.count()).toBe(0);
  });

  test('a failed audit append rolls back a claim, command receipt, and Work item version', async () => {
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(fixture.claim()).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.db.fixAttempt.count()).toBe(0);
    expect(await fixture.db.workCommand.count()).toBe(0);
    expect(await fixture.read()).toMatchObject({ version: 0 });
    expect((await fixture.read()).activeAttempt).toBeUndefined();
  });
});
