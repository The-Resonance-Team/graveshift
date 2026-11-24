import { FixResultSchema, WorkRoutingSchema, CreatedWorkResultSchema } from '@graveshift/work';
import { processQueued, publishSubject } from '@graveshift/events';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import request from 'supertest';

import type { PrismaService } from '../../api/src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase, resetDatabase } from '../../api/test/database/fixtures';
import { caller, envelope } from './flow-fixtures';
import { createPlatform, TEST_BASE_SHA } from './platform.fixture';
import { publicCommand } from './platform-http.fixture';
import { workActivation } from './work-activation';

describe.skipIf(!dbTestEnabled)('Postgres API and daemon composition over private HTTP', () => {
  let db: PrismaService;
  let platform: Awaited<ReturnType<typeof createPlatform>>;
  beforeEach(async () => {
    db = await openTestDatabase();
    await resetDatabase(db);
    platform = await createPlatform(db);
  });
  afterEach(async () => {
    await platform?.close();
    await db?.onModuleDestroy();
  });

  test('public Fix now crosses both authenticated hops and commits the verified draft and audit', async () => {
    await platform.seed('needs_human');
    const manual = await publicCommand(platform.app, 'work-1', 'fix-now', 'manual', {});
    expect(platform.responses).toContainEqual({
      side: 'api',
      path: '/internal/work-items/work-1/replay',
      status: 200,
      bytes: 4,
    });
    expect(manual.status).toBe(403);
    expect(manual.body).toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
    expect(platform.models).toEqual([]);
    expect(platform.recording.calls).toEqual([]);
    const triage = await publicCommand(platform.app, 'work-1', 'triage', 'assign', {
      assignee: 'needs_agent_Assigned Agent',
    });
    expect(triage.status).toBe(200);
    expect(triage.body.autoFix).toBeNull();
    const response = await publicCommand(platform.app, 'work-1', 'fix-now', 'fix-1', {});
    expect(response.status).toBe(200);
    const result = FixResultSchema.parse(response.body);
    expect(result).toMatchObject({ ok: true, pr: { number: 8, headSha: 'head-sha' } });
    const attempt = await db.fixAttempt.findUniqueOrThrow({
      where: { id: result.attemptId ?? '' },
    });
    expect(attempt).toMatchObject({
      state: 'completed',
      agent: 'Assigned Agent',
      trigger: 'fix_now',
    });
    expect(
      (await platform.work.read({ projectId: caller.projectId, id: 'work-1' })).item.draftPr,
    ).toEqual(result.pr);
    expect(platform.models).toHaveLength(1);
    expect(platform.recording.writes).toContainEqual(
      expect.objectContaining({ base: TEST_BASE_SHA }),
    );
    expect(platform.recording.writes).toContainEqual(expect.objectContaining({ draft: true }));
    const modelAudit = await db.auditEntry.findFirstOrThrow({ where: { type: 'model.call' } });
    expect(modelAudit).toMatchObject({
      incidentId: 'incident-1',
      payload: { task: 'generate_patch', service: 'checkout', status: 'ok' },
    });
    expect(await platform.audit.verifyChain(caller.projectId)).toMatchObject({ ok: true });
    const replay = await publicCommand(platform.app, 'work-1', 'fix-now', 'fix-1', {});
    expect(FixResultSchema.parse(replay.body)).toEqual(result);
    expect(platform.models).toHaveLength(1);
    expect(platform.captured.every((hop) => hop.authenticated)).toBe(true);
    expect(platform.captured).toContainEqual({
      side: 'daemon',
      path: '/internal/work/fix-now',
      authenticated: true,
    });
    expect(platform.captured).toContainEqual({
      side: 'api',
      path: '/internal/audit',
      authenticated: true,
    });
    expect(platform.captured).toContainEqual({
      side: 'api',
      path: '/internal/context',
      authenticated: true,
    });
  });

  test('a saved public routing question survives a new database client and resumes the same attempt', async () => {
    await platform.seed('needs_agent_Question Agent');
    const response = await publicCommand(platform.app, 'work-1', 'fix-now', 'question-1', {});
    expect(response.status).toBe(200);
    const asked = FixResultSchema.parse(response.body);
    expect(asked.failure).toBe('awaiting_answer');
    if (asked.routing?.kind !== 'ask' || asked.attemptId === null)
      throw new Error('Expected saved routing question');
    const fresh = await openTestDatabase();
    await platform.close();
    await db.onModuleDestroy();
    db = fresh;
    platform = await createPlatform(db);
    const read = await request(platform.app.getHttpServer()).get('/api/work-items/work-1/routing');
    expect(read.status).toBe(200);
    expect(WorkRoutingSchema.parse(read.body)).toMatchObject({
      routing: {
        attemptId: asked.attemptId,
        state: 'awaiting_answer',
        questionId: asked.routing.questionId,
      },
    });
    const body = {
      attemptId: asked.attemptId,
      questionId: asked.routing.questionId,
      params: { VERSION: 'v2' },
    };
    const resumed = await publicCommand(platform.app, 'work-1', 'answer', 'answer-1', body);
    expect(resumed.status).toBe(200);
    expect(FixResultSchema.parse(resumed.body)).toMatchObject({
      ok: true,
      attemptId: asked.attemptId,
      pr: { number: 8 },
    });
    expect(await db.fixAttempt.count()).toBe(1);
    expect(await db.auditEntry.count({ where: { type: 'model.call' } })).toBe(2);
    const duplicate = await publicCommand(platform.app, 'work-1', 'answer', 'answer-1', body);
    expect(duplicate.body).toEqual(resumed.body);
    expect(platform.models).toHaveLength(1);
    expect(await platform.audit.verifyChain(caller.projectId)).toMatchObject({ ok: true });
  });

  test('a failed durable model acknowledgement stops publication through the real audit route', async () => {
    await platform.seed();
    const append = platform.audit.append.bind(platform.audit);
    const auditFailure = spyOn(platform.audit, 'append').mockImplementation(
      async (projectId, draft) => {
        if (draft.type === 'model.call') throw new Error('Required audit is unavailable');
        return append(projectId, draft);
      },
    );
    try {
      const response = await publicCommand(platform.app, 'work-1', 'fix-now', 'audit-failure', {});
      expect(response.status).toBe(200);
      expect(FixResultSchema.parse(response.body)).toMatchObject({
        ok: false,
        failure: 'audit_failed',
        pr: null,
      });
      expect(platform.models).toHaveLength(1);
      expect(platform.recording.writes).toEqual([]);
      expect(await db.fixAttempt.findFirst()).toMatchObject({ state: 'failed' });
      expect(await db.auditEntry.count({ where: { type: 'model.call' } })).toBe(0);
      expect(await platform.audit.verifyChain(caller.projectId)).toMatchObject({ ok: true });
    } finally {
      auditFailure.mockRestore();
    }
  });

  test('NATS delivery creates and activates the assigned automatic Agent before acknowledgement', async () => {
    const org = await db.organization.create({ data: { name: 'Platform', slug: 'platform' } });
    await db.project.create({
      data: {
        projectId: caller.projectId,
        orgId: org.id,
        name: 'Platform',
        slug: 'platform',
      },
    });
    await db.deploy.create({
      data: {
        projectId: caller.projectId,
        environment: 'production',
        deploymentId: TEST_BASE_SHA,
        title: 'platform-deploy',
        dateStarted: new Date('2026-11-21T10:00:00.000Z'),
      },
    });
    const observe = await platform.observe();
    const acknowledgements: string[] = [];
    const delivery = {
      data: new TextEncoder().encode(JSON.stringify(envelope)),
      subject: publishSubject(envelope),
      term: () => acknowledgements.push('term'),
      working: () => {},
      nak: () => acknowledgements.push('nak'),
      ackAck: async () => {
        expect(await db.fixAttempt.findFirst()).toMatchObject({
          state: 'completed',
          trigger: 'auto_fix',
        });
        acknowledgements.push('ack');
        return true;
      },
    };
    await processQueued(delivery, observe, { grantedProjectIds: [caller.projectId] });
    expect(acknowledgements).toEqual(['ack']);
    expect(await db.workItem.count()).toBe(1);
    expect(await db.fixAttempt.count()).toBe(1);
    expect(await db.auditEntry.count({ where: { type: 'model.call' } })).toBe(2);
    expect(await db.auditEntry.count({ where: { type: 'deployment.closed' } })).toBe(1);
    expect(await db.deploy.findFirstOrThrow()).toMatchObject({
      deploymentId: TEST_BASE_SHA,
      closedAt: expect.any(Date),
    });
    const restarted = await platform.observe();
    await processQueued(delivery, restarted, { grantedProjectIds: [caller.projectId] });
    expect(acknowledgements).toEqual(['ack', 'ack']);
    expect(await db.fixAttempt.count()).toBe(1);
    expect(platform.models).toHaveLength(2);
  });

  test('a person assignment after creation wins the automatic activation race in Postgres', async () => {
    await platform.seedHaunting();
    const created = await platform.api.post(
      '/internal/work-items/from-haunting',
      {
        projectId: caller.projectId,
        eventId: 'platform:create',
        incidentId: 'incident-1',
      },
      CreatedWorkResultSchema,
    );
    expect(created.created).toBe(true);
    expect(created.item.assignee).toBe('needs_agent_Automatic Agent');
    const changed = await publicCommand(platform.app, created.item.id, 'triage', 'human-priority', {
      assignee: 'needs_human',
    });
    expect(changed.status).toBe(200);
    await workActivation(platform.daemon, caller.projectId)(created.item, 'incident-1');
    expect(
      (await platform.work.read({ projectId: caller.projectId, id: created.item.id })).item
        .assignee,
    ).toBe('needs_human');
    expect(await db.fixAttempt.count()).toBe(0);
    expect(platform.models).toEqual([]);
    expect(platform.recording.writes).toEqual([]);
  });
});
