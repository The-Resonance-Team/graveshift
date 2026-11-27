import type { WorkCommands } from '@graveshift/work';
import { describe, expect, test } from 'bun:test';
import request from 'supertest';

import { dbTestEnabled, openTestDatabase } from '../../test/database/fixtures';
import { AuditRepo } from '../audit/audit.repo';
import { attemptFence, setupWorkDatabase, WORK_TEST_AGENTS } from './testing/work-db.fixture';
import { DEFAULT_WORK_SCOPES, workHttpApp } from './testing/work-http.fixture';
import { WorkItemRepo } from './work-item.repo';
import { testProjectGrant } from '../internal/testing/project-grant.fixture';

describe.skipIf(!dbTestEnabled)('saved Work item question recovery through public HTTP', () => {
  const fixture = setupWorkDatabase();

  test('a new client finds a saved question after a lost response and answers the same attempt', async () => {
    await fixture.question();
    const persisted = await fixture.read();
    const originalId = persisted.activeAttempt?.id;
    const fresh = await openTestDatabase();
    const audit = new AuditRepo(fresh);
    const restarted = new WorkItemRepo(
      fresh,
      audit,
      WORK_TEST_AGENTS,
      testProjectGrant(['project-1']),
    );
    const commands: WorkCommands = {
      async triage() {
        throw new Error('Unexpected triage');
      },
      async fixNow() {
        throw new Error('Unexpected Fix now');
      },
      async answer(caller, id, body) {
        const current = await restarted.read({ projectId: caller.projectId, id });
        const attempt = current.activeAttempt;
        if (!attempt) throw new Error('Expected saved attempt');
        const claimed = await restarted.applyAnswer({
          caller: caller,
          id: id,
          input: {
            expectedVersion: current.version,
            attemptVersion: attempt.version,
            body,
          },
        });
        if (claimed.kind === 'replay') {
          if (claimed.outcome.kind !== 'fix') throw new Error('Expected Fix outcome');
          return claimed.outcome.result;
        }
        return restarted.finish({
          caller: caller,
          id: id,
          input: {
            ...attemptFence(claimed.snapshot),
            state: 'failed',
            outcome: {
              ok: false,
              effect: 'deny',
              pr: null,
              reason: 'low_confidence',
              failure: 'policy_denied',
              routing: null,
            },
          },
        });
      },
    };
    const { app, token } = await workHttpApp(restarted, commands, DEFAULT_WORK_SCOPES, audit);
    try {
      await request(app.getHttpServer()).get('/api/work-items/work-1/routing').expect(401);
      const recovered = await request(app.getHttpServer())
        .get('/api/work-items/work-1/routing')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(recovered.body).toEqual({
        routing: {
          attemptId: originalId,
          agent: 'fixture',
          trigger: 'fix_now',
          state: 'awaiting_answer',
          questionId: `${originalId}:question`,
          question: 'What incident must the Agent resolve?',
          missing: ['INCIDENT'],
        },
      });
      expect(JSON.stringify(recovered.body)).not.toContain('Verified incident');
      expect(recovered.body.routing).not.toHaveProperty('params');
      const answered = await request(app.getHttpServer())
        .post('/api/work-items/work-1/answer')
        .auth(token, { type: 'bearer' })
        .send({
          attemptId: recovered.body.routing.attemptId,
          questionId: recovered.body.routing.questionId,
          params: { INCIDENT: 'OOM' },
        })
        .expect(200);
      expect(answered.body).toMatchObject({
        attemptId: originalId,
        trigger: 'fix_now',
        failure: 'policy_denied',
      });
      expect(answered.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      const terminal = await request(app.getHttpServer())
        .get('/api/work-items/work-1/routing')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(terminal.body).toEqual({ routing: null });
      expect(await fresh.fixAttempt.count()).toBe(1);
    } finally {
      await app.close();
      await fresh.onModuleDestroy();
    }
  });
});
