import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import request from 'supertest';

import { AuditConflict } from '../audit/audit.errors';
import { DeploymentClosure } from '../deploys/deployment-closure';
import { DeployRepo } from '../deploys/deploy.repo';
import { ProjectGrant } from '../internal/project-grant';
import { testProjectGrant } from '../internal/testing/project-grant.fixture';
import { InternalGuard } from '../internal/internal.guard';
import { HauntingController } from './haunting.controller';
import { HauntingRepo } from './haunting.repo';
import { HauntingService } from './haunting.service';
import { HAUNTING_FIXTURE } from './testing/haunting.fixture';

const token = 'haunting-test-internal-only-32-chars';
const body = {
  projectId: 'project-1',
  eventId: 'event-1',
  environment: 'production',
  view: HAUNTING_FIXTURE,
};
const upsert = mock<HauntingRepo['upsert']>(async () => HAUNTING_FIXTURE);
const list = mock<HauntingRepo['list']>(async () => [HAUNTING_FIXTURE]);
const get = mock<HauntingRepo['get']>(async () => HAUNTING_FIXTURE);
const context = mock<HauntingRepo['context']>(async () => HAUNTING_FIXTURE);
const closeFirst = mock<DeployRepo['closeFirst']>(async () => true);
const deploys = { closeFirst } as unknown as DeployRepo;
let app: INestApplication;

describe('private Haunting boundary', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HauntingController],
      providers: [
        HauntingService,
        InternalGuard,
        { provide: ProjectGrant, useValue: testProjectGrant(['project-1']) },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            GRAVESHIFT_API_INTERNAL_TOKEN: token,
          }),
        },
        { provide: HauntingRepo, useValue: { upsert, list, get, context } },
        { provide: DeploymentClosure, useValue: new DeploymentClosure(deploys) },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());

  const call = (route: string, input: object) =>
    request(app.getHttpServer())
      .post(`/internal/hauntings${route}`)
      .set('Authorization', `Bearer ${token}`)
      .send(input);

  test('authenticates before validating a request and rejects a foreign project', async () => {
    await request(app.getHttpServer()).post('/internal/hauntings').send({}).expect(401);
    await call('', { ...body, projectId: 'foreign' }).expect(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  test('validates every nested recorded field and rejects undeclared fields', async () => {
    const inputs = [
      { ...body, extra: true },
      { ...body, eventId: '' },
      { ...body, view: { ...HAUNTING_FIXTURE, extra: true } },
      {
        ...body,
        view: { ...HAUNTING_FIXTURE, incident: { ...HAUNTING_FIXTURE.incident, extra: true } },
      },
      { ...body, view: { ...HAUNTING_FIXTURE, detections: [{ rule: 'runtime.restart-loop' }] } },
    ];
    await Promise.all(inputs.map((input) => call('', input).expect(422)));
    expect(upsert).not.toHaveBeenCalled();
  });

  test('rejects a recorded Environment name outside the shared pattern', async () => {
    upsert.mockClear();
    const inputs = ['bad name', 'prod/us', 'a'.repeat(101)].map((environment) => ({
      ...body,
      environment,
    }));
    await Promise.all(inputs.map((input) => call('', input).expect(422)));
    expect(upsert).not.toHaveBeenCalled();
  });

  test('does not acknowledge the event before the repository commit resolves', async () => {
    const entered = Promise.withResolvers<void>();
    const commit = Promise.withResolvers<typeof HAUNTING_FIXTURE>();
    upsert.mockImplementationOnce(() => {
      entered.resolve();
      return commit.promise;
    });
    let acknowledged = false;
    const response = call('', body).then((result) => {
      acknowledged = true;
      return result;
    });
    await entered.promise;
    try {
      expect(acknowledged).toBe(false);
      expect(upsert).toHaveBeenCalledWith('project-1', 'event-1', HAUNTING_FIXTURE, 'production');
    } finally {
      commit.resolve(HAUNTING_FIXTURE);
    }
    expect((await response).body).toEqual(HAUNTING_FIXTURE);
  });

  test('a recorded Haunting closes the Deployment inherited from its Event', async () => {
    await call('', body).expect(200);
    expect(closeFirst).toHaveBeenCalledWith(
      'project-1',
      HAUNTING_FIXTURE.deploymentId,
      'production',
    );
  });

  test('a later Event from another Environment with the same SHA does not close the opening Deployment', async () => {
    closeFirst.mockClear();
    upsert.mockImplementationOnce(async () => ({
      ...HAUNTING_FIXTURE,
      deploymentEnvironment: 'staging',
    }));
    await call('', body).expect(200);
    expect(closeFirst).not.toHaveBeenCalled();
  });

  test('a reused event key produces a conflict with no success acknowledgement', async () => {
    upsert.mockRejectedValueOnce(new AuditConflict());
    const response = await call('', body).expect(409);
    expect(response.body.code).toBe('AUDIT_KEY_CONFLICT');
    expect(response.body.incident).toBeUndefined();
  });

  test('private read DTOs keep project, limit and Diagnosis binding strict', async () => {
    expect((await call('/list', { projectId: 'project-1', limit: 3 }).expect(200)).body).toEqual([
      HAUNTING_FIXTURE,
    ]);
    expect(
      (await call('/get', { projectId: 'project-1', id: 'haunting-1' }).expect(200)).body,
    ).toEqual(HAUNTING_FIXTURE);
    expect(
      (
        await call('/context', {
          projectId: 'project-1',
          service: 'api',
          diagnosisRef: 'diagnosis-1',
        }).expect(200)
      ).body,
    ).toEqual(HAUNTING_FIXTURE);
    expect(context).toHaveBeenCalledWith('project-1', 'api', 'diagnosis-1');
    await call('/list', { projectId: 'project-1', limit: null }).expect(422);
    await call('/get', { projectId: 'project-1', id: 'haunting-1', extra: true }).expect(422);
    await call('/context', { projectId: 'project-1', diagnosisRef: 'diagnosis-1' }).expect(422);
    await call('/get', { projectId: 'foreign', id: 'haunting-1' }).expect(403);
  });
});
