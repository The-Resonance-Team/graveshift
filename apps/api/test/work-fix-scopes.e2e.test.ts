import { WORK_COMMANDS } from '@graveshift/work';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { CREDENTIAL_CONFIG } from '../src/auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../src/auth/oauth-client-credentials.strategy';
import { AUDIT_SINK } from '../src/audit/audit.sink';
import { InMemoryAuditSink } from '../src/audit/testing/in-memory-audit.sink';
import { AuditedWorkCommands, WORK_COMMANDS_INNER } from '../src/fix/audited-work.commands';
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { WorkItemsController } from '../src/work-items/controllers/work-items.controller';
import { WorkItemRepo } from '../src/work-items/work-item.repo';
import { TEST_CONFIG, TEST_ROOT_ENV } from './fakes/auth-test-config';
import { testIdentityRepo } from './fakes/auth-test-helpers';
import { fakeWorkApi } from './fakes/fake-fix-deps';

/**
 * The stored client-1 holds `fix:trigger` and `tokens:manage`. A test token selects which of
 * the held scopes it actually carries, so a denial proves the route gate, not the registry.
 */
async function boot(options: { readonly fail?: boolean } = {}) {
  const adapter = fakeWorkApi({ projectId: '12345', ...options });
  const moduleRef = await Test.createTestingModule({
    imports: [
      PassportModule,
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ],
    controllers: [WorkItemsController],
    providers: [
      OAuthClientCredentialsStrategy,
      AuditedWorkCommands,
      { provide: WORK_COMMANDS, useExisting: AuditedWorkCommands },
      { provide: WORK_COMMANDS_INNER, useValue: adapter.commands },
      { provide: AUDIT_SINK, useValue: new InMemoryAuditSink() },
      { provide: CREDENTIAL_CONFIG, useValue: TEST_CONFIG },
      { provide: IDENTITY_REPO, useValue: testIdentityRepo() },
      { provide: ConfigService, useValue: new ConfigService(TEST_ROOT_ENV) },
      { provide: WorkItemRepo, useValue: adapter.repo },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  await app.init();
  const sign = (scope: string[]): string =>
    moduleRef.get(JwtService).sign(
      { sub: 'client-1', projectId: '12345', scope },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        expiresIn: 300,
      },
    );
  return { adapter, app, sign };
}

describe('work item Fix route scopes', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('a token without fix:trigger is denied on every Fix mutation but keeps reads', async () => {
    const started = await boot();
    app = started.app;
    const managementOnly = started.sign(['tokens:manage', 'incidents:read']);

    // The read surface keeps working under the read scope, without fix:trigger.
    await request(app.getHttpServer())
      .get('/api/work-items')
      .auth(managementOnly, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/work-items/work-1')
      .auth(managementOnly, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/work-items/work-1/routing')
      .auth(managementOnly, { type: 'bearer' })
      .expect(200);

    // Every route that can start or resume a Fix attempt denies without fix:trigger.
    const server = app.getHttpServer();
    const denied = await Promise.all(
      (['triage', 'fix-now', 'answer'] as const).map((route) =>
        request(server)
          .post(`/api/work-items/work-1/${route}`)
          .auth(managementOnly, { type: 'bearer' })
          .send({}),
      ),
    );
    for (const response of denied) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('The token must hold fix:trigger');
    }
    // No daemon call, no audit entry: the denial happens at the guard.
    expect(started.adapter.calls).toEqual([]);
  });

  test('the same client reaches the daemon once its token carries fix:trigger', async () => {
    const started = await boot();
    app = started.app;
    const triggering = started.sign(['tokens:manage', 'fix:trigger']);
    const response = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(triggering, { type: 'bearer' })
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({ ok: true });
    expect(started.adapter.calls.map((call) => call.method)).toEqual(['fixNow']);
  });

  test('an anonymous request is rejected before the scope check', async () => {
    const started = await boot();
    app = started.app;
    await request(app.getHttpServer()).post('/api/work-items/work-1/fix-now').send({}).expect(401);
    expect(started.adapter.calls).toEqual([]);
  });
});
