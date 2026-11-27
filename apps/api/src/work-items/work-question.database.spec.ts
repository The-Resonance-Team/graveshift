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

describe.skipIf(!dbTestEnabled)('Postgres Work item routing progress', () => {
  const fixture = setupWorkDatabase();

  test('one saved question survives a restart and a complete answer claims the same attempt and trigger', async () => {
    const asked = await fixture.question();
    expect(asked.failure).toBe('awaiting_answer');
    const fresh = await openTestDatabase();
    try {
      const restarted = new WorkItemRepo(
        fresh,
        new AuditRepo(fresh),
        WORK_TEST_AGENTS,
        testProjectGrant(['project-1']),
      );
      const snapshot = await restarted.read({ projectId: 'project-1', id: 'work-1' });
      const attempt = snapshot.activeAttempt;
      if (!attempt || !attempt.questionId) throw new Error('Expected saved question');
      expect(attempt.routingProgress?.question).toBe('What incident must the Agent resolve?');
      const answer = {
        attemptId: attempt.id,
        questionId: attempt.questionId,
        params: { INCIDENT: 'OOM' },
      };
      const claimed = await restarted.applyAnswer({
        caller: workCaller('answer-1'),
        id: 'work-1',
        input: {
          expectedVersion: snapshot.version,
          attemptVersion: attempt.version,
          body: answer,
        },
      });
      expect(claimed).toMatchObject({
        kind: 'claimed',
        attempt: {
          id: asked.attemptId,
          trigger: 'fix_now',
          state: 'running',
          params: { INCIDENT: 'OOM' },
        },
      });
      const next = await restarted.read({ projectId: 'project-1', id: 'work-1' });
      await expect(
        restarted.saveQuestion({
          caller: workCaller('answer-1'),
          id: 'work-1',
          input: {
            ...attemptFence(next),
            progress: attempt.routingProgress!,
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await fresh.fixAttempt.count()).toBe(1);
      expect(
        (await restarted.read({ projectId: 'project-1', id: 'work-1' })).activeAttempt?.questionId,
      ).toBe(attempt.questionId);
    } finally {
      await fresh.onModuleDestroy();
    }
  });

  test('an incomplete answer assigns a person and prevents a second question or Fix now', async () => {
    const asked = await fixture.question();
    const snapshot = await fixture.read();
    const attempt = snapshot.activeAttempt;
    if (!attempt || !attempt.questionId) throw new Error('Expected saved question');
    const caller = workCaller('answer-1');
    const body = { attemptId: attempt.id, questionId: attempt.questionId, params: {} };
    const result = await fixture.repo.applyAnswer({
      caller: caller,
      id: 'work-1',
      input: {
        expectedVersion: snapshot.version,
        attemptVersion: attempt.version,
        body,
      },
    });
    expect(result).toMatchObject({
      kind: 'replay',
      outcome: {
        kind: 'fix',
        result: {
          attemptId: asked.attemptId,
          trigger: 'fix_now',
          failure: 'needs_human',
          item: { assignee: 'needs_human' },
        },
      },
    });
    expect((await fixture.read()).activeAttempt).toBeUndefined();
    await expect(fixture.claim(workCaller('second-fix'))).rejects.toMatchObject({
      code: 'MANUAL_ASSIGNMENT',
    });
    expect(
      await fixture.repo.replay({ caller: caller, id: 'work-1', input: { kind: 'answer', body } }),
    ).toMatchObject({
      kind: 'fix',
      result: { failure: 'needs_human' },
    });
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });

  test('a repeated answer command cannot claim another attempt while the first answer runs', async () => {
    await fixture.question();
    const snapshot = await fixture.read();
    const attempt = snapshot.activeAttempt;
    if (!attempt || !attempt.questionId) throw new Error('Expected saved question');
    const input = {
      expectedVersion: snapshot.version,
      attemptVersion: attempt.version,
      body: { attemptId: attempt.id, questionId: attempt.questionId, params: { INCIDENT: 'OOM' } },
    };
    await fixture.repo.applyAnswer({ caller: workCaller('answer-1'), id: 'work-1', input: input });
    await expect(
      fixture.repo.applyAnswer({ caller: workCaller('answer-1'), id: 'work-1', input: input }),
    ).rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' });
    await expect(
      fixture.repo.applyAnswer({ caller: workCaller('answer-2'), id: 'work-1', input: input }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });

  test('saved progress and audit entries contain no raw request secret or note', async () => {
    await fixture.claim();
    const snapshot = await fixture.read();
    const fence = attemptFence(snapshot);
    const secret = 'sk-proj-' + 'a'.repeat(48);
    await fixture.repo.saveQuestion({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...fence,
        progress: {
          version: 1,
          phase: 'awaiting_answer',
          attemptId: fence.attemptId,
          selectedAgent: { name: 'fixture', slug: 'fixture' },
          text: `A note contains ${secret}`,
          params: {},
          missing: ['INCIDENT'],
          question: `What happened? ${secret}`,
        },
      },
    });
    const stored = JSON.stringify(await fixture.db.fixAttempt.findMany());
    const audit = JSON.stringify(await fixture.audit.list('project-1'));
    expect(stored).not.toContain(secret);
    expect(audit).not.toContain(secret);
    expect(audit).not.toContain('A note contains');
  });

  test('an auto-fix answer keeps the original automatic trigger', async () => {
    const caller = workCaller();
    const command = { kind: 'triage' as const, body: { assignee: 'needs_agent_automatic' } };
    await fixture.repo.claim({
      caller: caller,
      id: 'work-1',
      input: { expectedVersion: 0, command },
    });
    const fence = attemptFence(await fixture.read());
    const asked = await fixture.repo.saveQuestion({
      caller: caller,
      id: 'work-1',
      input: {
        ...fence,
        progress: {
          version: 1,
          phase: 'awaiting_answer',
          attemptId: fence.attemptId,
          selectedAgent: { name: 'automatic', slug: 'automatic' },
          text: 'Verified incident',
          params: {},
          missing: ['INCIDENT'],
          question: 'What incident?',
        },
      },
    });
    const next = await fixture.read();
    const attempt = next.activeAttempt;
    if (!attempt?.questionId) throw new Error('Expected a saved question');
    const resumed = await fixture.repo.applyAnswer({
      caller: workCaller('answer-1'),
      id: 'work-1',
      input: {
        expectedVersion: next.version,
        attemptVersion: attempt.version,
        body: {
          attemptId: attempt.id,
          questionId: attempt.questionId,
          params: { INCIDENT: 'OOM' },
        },
      },
    });
    expect(resumed).toMatchObject({
      kind: 'claimed',
      attempt: { id: asked.attemptId, trigger: 'auto_fix', agent: 'automatic' },
    });
  });

  test('an answer audit failure rolls back its claim and keeps the saved question pending', async () => {
    await fixture.question();
    const snapshot = await fixture.read();
    const attempt = snapshot.activeAttempt;
    if (!attempt?.questionId) throw new Error('Expected a saved question');
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.applyAnswer({
          caller: workCaller('answer-1'),
          id: 'work-1',
          input: {
            expectedVersion: snapshot.version,
            attemptVersion: attempt.version,
            body: {
              attemptId: attempt.id,
              questionId: attempt.questionId,
              params: { INCIDENT: 'OOM' },
            },
          },
        }),
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.read()).toEqual(snapshot);
    expect(await fixture.db.workCommand.count()).toBe(1);
  });

  test('a removed Agent hands its saved question to a person without selecting another Agent', async () => {
    await fixture.question();
    const snapshot = await fixture.read();
    const attempt = snapshot.activeAttempt;
    if (!attempt?.questionId) throw new Error('Expected a saved question');
    const afterRestart = new WorkItemRepo(
      fixture.db,
      fixture.audit,
      [],
      testProjectGrant(['project-1']),
    );
    const result = await afterRestart.applyAnswer({
      caller: workCaller('answer-1'),
      id: 'work-1',
      input: {
        expectedVersion: snapshot.version,
        attemptVersion: attempt.version,
        body: {
          attemptId: attempt.id,
          questionId: attempt.questionId,
          params: { INCIDENT: 'OOM' },
        },
      },
    });
    expect(result).toMatchObject({
      kind: 'replay',
      outcome: {
        kind: 'fix',
        result: {
          failure: 'needs_human',
          reason: 'selected_agent_unavailable',
          item: { assignee: 'needs_human' },
        },
      },
    });
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });
});
