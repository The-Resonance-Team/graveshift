import { CreatedWorkResultSchema } from '@graveshift/work';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, spyOn, test } from 'bun:test';
import request from 'supertest';

import { dbTestEnabled } from '../../test/database/fixtures';
import { TEST_ROOT_ENV } from '../../test/fakes/auth-test-config';
import { HauntingRepo } from '../hauntings/haunting.repo';
import { HAUNTING_FIXTURE, HAUNTING_SECRET } from '../hauntings/testing/haunting.fixture';
import { InternalGuard } from '../internal/internal.guard';
import { WorkIngressController } from './controllers/work-ingress.controller';
import {
  attemptFence,
  setupWorkDatabase,
  WORK_TEST_AGENTS,
  workCaller,
} from './testing/work-db.fixture';
import { WorkIngressService } from './work-ingress.service';

const input = { projectId: 'project-1', eventId: 'event-1', incidentId: 'haunting-1' };

describe.skipIf(!dbTestEnabled)('verified Haunting to durable Work item ingress', () => {
  const fixture = setupWorkDatabase();

  async function ingress(withDiagnosis = true) {
    const hauntings = new HauntingRepo(fixture.db, fixture.audit);
    const view = structuredClone(HAUNTING_FIXTURE);
    delete view.pr;
    if (!withDiagnosis) delete view.incident.diagnosis;
    await hauntings.upsert('project-1', 'recorded-event-1', view);
    const agent = WORK_TEST_AGENTS.find((entry) => entry.autoFix);
    if (!agent) throw new Error('Expected automatic Agent');
    const service = new WorkIngressService(hauntings, fixture.repo, {
      projectId: 'project-1',
      agents: [{ ...agent, description: 'failure runtime restart-loop code bug' }],
    });
    return { service, hauntings, view };
  }

  test('the private literal route creates a validated Work item and one audit entry', async () => {
    const { service } = await ingress();
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkIngressController],
      providers: [
        InternalGuard,
        { provide: ConfigService, useValue: new ConfigService(TEST_ROOT_ENV) },
        { provide: WorkIngressService, useValue: service },
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    );
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/internal/work-items/from-haunting')
        .send(input)
        .expect(401);
      await request(app.getHttpServer())
        .post('/internal/work-items/from-haunting')
        .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
        .send({ ...input, assignee: 'needs_human' })
        .expect(422);
      const response = await request(app.getHttpServer())
        .post('/internal/work-items/from-haunting')
        .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
        .send(input)
        .expect(200);
      const result = CreatedWorkResultSchema.parse(response.body);
      expect(result).toMatchObject({
        created: true,
        item: {
          service: 'api',
          reporter: 'wraith',
          severity: 'critical',
          assignee: 'needs_agent_automatic',
          diagnosisRef: 'diagnosis-1',
        },
      });
      const snapshot = await fixture.repo.read({ projectId: 'project-1', id: result.item.id });
      expect(snapshot.diagnosis).toEqual(HAUNTING_FIXTURE.incident.diagnosis);
      expect(snapshot.version).toBe(0);
      expect(JSON.stringify(snapshot)).not.toContain(HAUNTING_SECRET);
      expect(
        (await fixture.audit.list('project-1')).filter((entry) => entry.type === 'work.created'),
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  test('competing creation requests return one Work item and exactly one created receipt', async () => {
    const { service } = await ingress();
    const results = await Promise.all([
      service.fromHaunting(input),
      service.fromHaunting({ ...input, eventId: 'redelivered-event' }),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results[0]?.item.id).toBe(results[1]?.item.id);
    expect(await fixture.db.workItem.count()).toBe(2);
    expect(
      (await fixture.audit.list('project-1')).filter((entry) => entry.type === 'work.created'),
    ).toHaveLength(1);
  });

  test('a later detection cannot replace Human assignment or the original verified Diagnosis', async () => {
    const { service, hauntings, view } = await ingress();
    const first = await service.fromHaunting(input);
    await fixture.repo.saveTriage({
      caller: workCaller('human-triage'),
      id: first.item.id,
      input: {
        expectedVersion: 0,
        body: { assignee: 'needs_human' },
      },
    });
    const diagnosis = view.incident.diagnosis;
    if (!diagnosis) throw new Error('Expected Diagnosis');
    await hauntings.upsert('project-1', 'later-event', {
      ...view,
      incident: {
        ...view.incident,
        diagnosis: { ...diagnosis, id: 'new-diagnosis', rootCause: 'A later fact' },
      },
    });
    const repeated = await service.fromHaunting({ ...input, eventId: 'later-event' });
    expect(repeated).toMatchObject({
      created: false,
      item: {
        assignee: 'needs_human',
        description: first.item.description,
        diagnosisRef: first.item.diagnosisRef,
      },
    });
    await expect(
      fixture.repo.saveTriage({
        caller: { ...workCaller('initial-assignment'), expectedVersion: 0 },
        id: first.item.id,
        input: {
          expectedVersion: 1,
          body: { assignee: 'needs_agent_automatic' },
        },
      }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect(await fixture.db.fixAttempt.count()).toBe(0);
  });

  test('creation redelivery retains an active attempt and its known Exorcism', async () => {
    const { service } = await ingress();
    const created = await service.fromHaunting(input);
    await fixture.repo.claim({
      caller: workCaller(),
      id: created.item.id,
      input: {
        expectedVersion: 0,
        command: { kind: 'triage', body: { assignee: created.item.assignee } },
      },
    });
    const ref = { projectId: 'project-1', id: created.item.id };
    const intent = { repo: 'owner/repo', branch: 'graveshift/work', baseSha: 'base-sha' };
    const publishing = await fixture.repo.beginPublication({
      caller: workCaller(),
      id: created.item.id,
      input: {
        ...attemptFence(await fixture.repo.read(ref)),
        intent,
      },
    });
    const pr = {
      repo: intent.repo,
      branch: intent.branch,
      number: 7,
      headSha: 'head-sha',
      url: 'https://github.test/owner/repo/pull/7',
    };
    await fixture.repo.recordPublication({
      caller: workCaller(),
      id: created.item.id,
      input: {
        ...attemptFence(publishing),
        pr,
        baseSha: intent.baseSha,
      },
    });
    const before = await fixture.repo.read(ref);
    expect(await service.fromHaunting(input)).toEqual({ created: false, item: before.item });
    expect(await fixture.repo.read(ref)).toEqual(before);
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });

  test('the creation audit failure rolls back the Work item', async () => {
    const { service } = await ingress();
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(service.fromHaunting(input)).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.repo.findByHaunting('project-1', input.incidentId)).toBeUndefined();
  });

  test('missing Diagnosis, missing Haunting, and foreign projects create no Work item', async () => {
    const { service } = await ingress(false);
    await expect(service.fromHaunting(input)).rejects.toMatchObject({
      code: 'DIAGNOSIS_REQUIRED',
      status: 422,
    });
    await expect(service.fromHaunting({ ...input, incidentId: 'missing' })).rejects.toMatchObject({
      code: 'HAUNTING_NOT_FOUND',
      status: 404,
    });
    await expect(service.fromHaunting({ ...input, projectId: 'project-2' })).rejects.toMatchObject({
      code: 'PROJECT_FORBIDDEN',
      status: 403,
    });
    expect(await fixture.db.workItem.count()).toBe(1);
  });

  test('no matching Agent creates a Human assignment with auto-fix disabled', async () => {
    const { hauntings } = await ingress();
    const service = new WorkIngressService(hauntings, fixture.repo, {
      projectId: 'project-1',
      agents: [],
    });
    expect(await service.fromHaunting(input)).toMatchObject({
      created: true,
      item: {
        assignee: 'needs_human',
      },
    });
    expect(await fixture.db.fixAttempt.count()).toBe(0);
  });
});
