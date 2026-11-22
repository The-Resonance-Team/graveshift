import { WORK_COMMANDS } from '@graveshift/work';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { CREDENTIAL_CONFIG } from '../src/auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../src/auth/oauth-client-credentials.strategy';
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { InternalGuard } from '../src/internal/internal.guard';
import { InternalWorkController } from '../src/work-items/controllers/internal-work.controller';
import { WorkItemsController } from '../src/work-items/controllers/work-items.controller';
import { WorkItemRepo } from '../src/work-items/work-item.repo';
import { TEST_CONFIG, TEST_ROOT_ENV } from './fakes/auth-test-config';
import { testIdentityRepo } from './fakes/auth-test-helpers';
import { fakeWorkApi } from './fakes/fake-fix-deps';

describe('Work item HTTP boundary', () => {
  let app: INestApplication;
  let adapter: ReturnType<typeof fakeWorkApi>;
  let token: string;

  async function start(options: Parameters<typeof fakeWorkApi>[0] = {}) {
    adapter = fakeWorkApi({ projectId: '12345', ...options });
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [WorkItemsController, InternalWorkController],
      providers: [
        OAuthClientCredentialsStrategy,
        InternalGuard,
        { provide: CREDENTIAL_CONFIG, useValue: TEST_CONFIG },
        { provide: IDENTITY_REPO, useValue: testIdentityRepo() },
        { provide: ConfigService, useValue: new ConfigService(TEST_ROOT_ENV) },
        { provide: WorkItemRepo, useValue: adapter.repo },
        { provide: WORK_COMMANDS, useValue: adapter.commands },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    await app.init();
    token = moduleRef.get(JwtService).sign(
      {
        sub: 'client-1',
        projectId: '12345',
        scope: ['tokens:manage'],
      },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        expiresIn: 300,
      },
    );
  }

  beforeEach(async () => start());
  afterEach(async () => app.close());

  test('requires a management token and uses its project for reads', async () => {
    await request(app.getHttpServer()).get('/api/work-items').expect(401);
    await request(app.getHttpServer()).post('/api/work-items/work-1/fix-now').send({}).expect(401);
    const detail = await request(app.getHttpServer())
      .get('/api/work-items/work-1')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(detail.body.diagnosisRef).toBe('diagnosis-1');
    await request(app.getHttpServer())
      .get('/api/work-items/missing')
      .auth(token, { type: 'bearer' })
      .expect(404);
  });

  test('rejects a signed token from a different project with PROJECT_FORBIDDEN', async () => {
    const foreign = app.get(JwtService).sign(
      { sub: 'client-2', projectId: '12346', scope: ['tokens:manage'] },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        expiresIn: 300,
      },
    );
    const response = await request(app.getHttpServer())
      .get('/api/work-items/work-1')
      .auth(foreign, { type: 'bearer' })
      .expect(403);
    expect(response.body.code).toBe('PROJECT_FORBIDDEN');
  });

  test('lists and validates filters with stable pagination', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/work-items?status=todo&limit=1&offset=1')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(page.body).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.body.items).toHaveLength(1);
    await Promise.all(
      ['offset=-1', 'limit=101', 'limit=abc', 'unknown=1', 'status=missing'].map((query) =>
        request(app.getHttpServer())
          .get(`/api/work-items?${query}`)
          .auth(token, { type: 'bearer' })
          .expect(422),
      ),
    );
  });

  test('delegates Fix now and keeps the completed public fields with routing and attempt ID', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'fix-command-1')
      .send({ note: 'Read memory use' })
      .expect(200);
    expect(result.body).toMatchObject({
      ok: true,
      trigger: 'fix_now',
      effect: 'allow',
      failure: 'none',
      reason: null,
      pr: { number: 7 },
      routing: null,
      attemptId: 'attempt-work-1',
      item: { fixPriority: 0 },
    });
    expect(adapter.calls).toEqual([
      {
        method: 'fixNow',
        id: 'work-1',
        input: { note: 'Read memory use' },
        caller: { projectId: '12345', actor: 'client-1', commandId: 'fix-command-1' },
      },
    ]);
    const replay = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'fix-command-1')
      .send({ note: 'Read memory use' })
      .expect(200);
    expect(replay.body).toEqual(result.body);
    expect(result.headers['idempotency-key']).toBe('fix-command-1');
  });

  test('rejects Human Fix now and completed triage through coded domain errors', async () => {
    const human = await request(app.getHttpServer())
      .post('/api/work-items/human/fix-now')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    expect(human.body.code).toBe('MANUAL_ASSIGNMENT');
    const done = await request(app.getHttpServer())
      .post('/api/work-items/done/triage')
      .auth(token, { type: 'bearer' })
      .send({ assignee: 'needs_human' })
      .expect(409);
    expect(done.body.code).toBe('TERMINAL_STATUS');
  });

  test('saves triage and returns a failed auto-fix outcome', async () => {
    await app.close();
    await start({ fail: true });
    const response = await request(app.getHttpServer())
      .post('/api/work-items/work-1/triage')
      .auth(token, { type: 'bearer' })
      .send({ assignee: 'needs_agent_Automatic Agent' })
      .expect(200);
    expect(response.body).toMatchObject({
      item: { assignee: 'needs_agent_Automatic Agent' },
      autoFix: { ok: false, failure: 'fix_error', routing: null, attemptId: 'attempt-work-1' },
    });
    const saved = await request(app.getHttpServer())
      .get('/api/work-items/work-1')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(saved.body.assignee).toBe('needs_agent_Automatic Agent');
  });

  test('preserves policy denial as a completed result', async () => {
    await app.close();
    await start({ deny: true });
    const response = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      ok: false,
      effect: 'deny',
      failure: 'policy_denied',
      pr: null,
      reason: 'low_confidence',
      item: { fixPriority: 0 },
    });
  });

  test('validates public bodies and command IDs before delegation', async () => {
    await Promise.all(
      [
        { unknown: true },
        { expectedVersion: 0 },
        { note: '' },
        { note: null },
        { note: 'x'.repeat(501) },
      ].map((body) =>
        request(app.getHttpServer())
          .post('/api/work-items/work-1/fix-now')
          .auth(token, { type: 'bearer' })
          .send(body)
          .expect(422),
      ),
    );
    await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'invalid command')
      .send({})
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/work-items/work-1/answer')
      .auth(token, { type: 'bearer' })
      .send({ attemptId: 'attempt-1', questionId: 'q1', params: { INCIDENT: 42 } })
      .expect(422);
    expect(adapter.calls).toHaveLength(0);
  });

  test('returns an empty routing summary when no attempt is active', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/work-items/work-1/routing')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual({ routing: null });
  });

  test('delegates a validated answer and returns the stale-question conflict', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/work-1/answer')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'answer-1')
      .send({ attemptId: 'attempt-1', questionId: 'question-1', params: { INCIDENT: 'OOM' } })
      .expect(409);
    expect(response.body.code).toBe('QUESTION_NOT_PENDING');
    expect(adapter.calls[0]).toMatchObject({
      method: 'answer',
      input: { params: { INCIDENT: 'OOM' } },
      caller: { commandId: 'answer-1' },
    });
  });

  test('protects private state routes and validates canonical nested schemas', async () => {
    await request(app.getHttpServer())
      .post('/internal/work-items/work-1/read')
      .send({ projectId: '12345' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/work-items/work-1/read')
      .auth(token, { type: 'bearer' })
      .send({ projectId: '12345' })
      .expect(401);
    const read = await request(app.getHttpServer())
      .post('/internal/work-items/work-1/read')
      .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
      .send({ projectId: '12345' })
      .expect(200);
    expect(read.body).toMatchObject({ version: 0, item: { id: 'work-1' } });
    await request(app.getHttpServer())
      .post('/internal/work-items/work-1/claim')
      .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
      .send({
        caller: { projectId: '12345', actor: 'daemon', commandId: 'claim-1' },
        input: { expectedVersion: 0, command: { kind: 'fix_now', body: { unknown: true } } },
      })
      .expect(422);
    await request(app.getHttpServer())
      .post('/internal/work-items/work-1/read')
      .auth(TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN, { type: 'bearer' })
      .send({ projectId: '12345', extra: true })
      .expect(422);
  });
});
