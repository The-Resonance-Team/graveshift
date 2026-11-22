import { WORK_COMMANDS, type WorkCaller } from '@graveshift/work';
import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { CREDENTIAL_CONFIG } from '../src/auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../src/auth/oauth-client-credentials.strategy';
import { AUDIT_SINK, type AuditRecord } from '../src/audit/audit.sink';
import { InMemoryAuditSink } from '../src/audit/testing/in-memory-audit.sink';
import { AuditedWorkCommands, WORK_COMMANDS_INNER } from '../src/fix/audited-work.commands';
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { WorkItemsController } from '../src/work-items/controllers/work-items.controller';
import { WorkItemRepo } from '../src/work-items/work-item.repo';
import { TEST_CONFIG, TEST_ROOT_ENV } from './fakes/auth-test-config';
import { testIdentityRepo } from './fakes/auth-test-helpers';
import { fakeWorkApi } from './fakes/fake-fix-deps';

const SECRET = 'fake-ghp-token';

/** One boot per test, with its own sink and its own daemon adapter. */
async function start(
  options: {
    readonly unauthenticatedPrincipal?: boolean;
    readonly delayMs?: (caller: WorkCaller) => number;
  } = {},
) {
  const adapter = fakeWorkApi({
    projectId: '12345',
    projectIds: ['12346'],
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
  });
  const audit = new InMemoryAuditSink();
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
      { provide: AUDIT_SINK, useValue: audit },
      { provide: CREDENTIAL_CONFIG, useValue: TEST_CONFIG },
      { provide: IDENTITY_REPO, useValue: testIdentityRepo() },
      { provide: ConfigService, useValue: new ConfigService(TEST_ROOT_ENV) },
      { provide: WorkItemRepo, useValue: adapter.repo },
    ],
  });
  if (options.unauthenticatedPrincipal === true) {
    // A route reached with a principal that carries no usable identity: the audit scope stays
    // unbound and the Fix command must be denied before the daemon adapter is called.
    moduleRef.overrideGuard(AuthGuard('oauth-client-credentials')).useValue({
      canActivate: (context: { switchToHttp(): { getRequest(): object } }) => {
        const incoming = context.switchToHttp().getRequest() as { user?: object };
        incoming.user = { clientId: '', projectId: '', scopes: ['tokens:manage', 'fix:trigger'] };
        return true;
      },
    });
  }
  const compiled = await moduleRef.compile();
  const app = compiled.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  await app.init();
  const jwt = compiled.get(JwtService);
  const token = (
    clientId: string,
    projectId: string,
    scope: readonly string[] = ['tokens:manage', 'fix:trigger'],
  ): string =>
    jwt.sign(
      { sub: clientId, projectId, scope: [...scope] },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        expiresIn: 300,
      },
    );
  return { app, adapter, audit, token };
}

const types = (records: AuditRecord[]): string[] => records.map((record) => record.type);

describe('work item fix audit', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test('two concurrent OAuth clients write to their own Project chains', async () => {
    // The two requests run at the same time: client 2's daemon call is quick and client 1's
    // stays open, so client 2 finishes first and client 1's outcome is written while — and
    // after — the other request has fully completed. The audit scope each write lands under
    // must come from its own request through AuditScopeInterceptor and AuditedWorkCommands.
    const fix = await start({
      delayMs: (caller) => (caller.projectId === '12345' ? 40 : 5),
    });
    app = fix.app;
    const first = fix.token('client-1', '12345');
    const second = fix.token('client-2', '12346');

    const [slow, quick] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/work-items/work-1/fix-now')
        .auth(first, { type: 'bearer' })
        .send({})
        .expect(200),
      request(app.getHttpServer())
        .post('/api/work-items/work-1/fix-now')
        .auth(second, { type: 'bearer' })
        .send({})
        .expect(200),
    ]);
    expect([slow.body.ok, quick.body.ok]).toEqual([true, true]);

    // Overlap is proven from the fake daemon's own record: both calls were open at once and
    // the quick one returned while the slow one was still running.
    expect(new Set(fix.adapter.timeline.slice(0, 2))).toEqual(
      new Set(['fixNow:12345:start', 'fixNow:12346:start']),
    );
    expect(fix.adapter.timeline[2]).toBe('fixNow:12346:done');
    expect(fix.adapter.timeline[3]).toBe('fixNow:12345:done');

    expect(fix.audit.projects().sort()).toEqual(['12345', '12346']);
    expect(fix.audit.entries('12345')).toHaveLength(1);
    expect(fix.audit.entries('12346')).toHaveLength(1);
    expect(fix.audit.entries('12345')[0]).toMatchObject({
      projectId: '12345',
      actor: 'client-1',
      type: 'fix.outcome',
      payload: { workItemId: 'work-1', ok: true, failure: 'none' },
    });
    expect(fix.audit.entries('12346')[0]).toMatchObject({
      projectId: '12346',
      actor: 'client-2',
      type: 'fix.outcome',
    });
    // Each chain holds only its own caller: no entry leaked across Projects.
    expect(new Set(fix.audit.entries('12345').map((record) => record.actor))).toEqual(
      new Set(['client-1']),
    );
    expect(new Set(fix.audit.entries('12346').map((record) => record.actor))).toEqual(
      new Set(['client-2']),
    );
    expect(fix.adapter.calls.map((call) => [call.method, call.caller.projectId])).toEqual([
      ['fixNow', '12345'],
      ['fixNow', '12346'],
    ]);
  });

  test('one outcome entry per attempt, and a replay of the command audits it once', async () => {
    const fix = await start();
    app = fix.app;
    const token = fix.token('client-1', '12345');
    const command = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'command-fixed')
      .send({})
      .expect(200);
    expect(command.body).toMatchObject({ ok: true });
    await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'command-fixed')
      .send({})
      .expect(200);
    expect(fix.audit.ofType('fix.outcome')).toHaveLength(1);
    expect(types(fix.audit.entries('12345'))).toEqual(['fix.outcome']);
  });

  test('a note with a secret never enters an audit payload', async () => {
    const fix = await start();
    app = fix.app;
    await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(fix.token('client-1', '12345'), { type: 'bearer' })
      .send({ note: `rotate ${SECRET} and read the title ${SECRET}` })
      .expect(200);
    // The daemon adapter received the note; the audit chain never saw it.
    expect(JSON.stringify(fix.adapter.calls)).toContain(SECRET);
    expect(JSON.stringify(fix.audit.entries('12345'))).not.toContain(SECRET);
  });

  test('a request with no authenticated audit scope is denied before the daemon is called', async () => {
    const fix = await start({ unauthenticatedPrincipal: true });
    app = fix.app;
    const denied = await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(fix.token('client-1', '12345'), { type: 'bearer' })
      .send({})
      .expect(403);
    expect(denied.body.message).toBe('The request has no authenticated audit scope');
    // No daemon call: no policy gate, no model call, no GitHub call, and no audit entry.
    expect(fix.adapter.calls).toEqual([]);
    expect(fix.audit.projects()).toEqual([]);
  });

  test('a Fix denial writes no outcome entry', async () => {
    const fix = await start();
    app = fix.app;
    await request(app.getHttpServer())
      .post('/api/work-items/human/fix-now')
      .auth(fix.token('client-1', '12345'), { type: 'bearer' })
      .send({})
      .expect(403);
    expect(fix.audit.projects()).toEqual([]);
  });

  test('no boot key names a Project for the audit chain', async () => {
    const fix = await start();
    app = fix.app;
    expect(TEST_ROOT_ENV).not.toHaveProperty('GRAVESHIFT_PROJECT_ID');
    expect(TEST_ROOT_ENV).not.toHaveProperty('AUDIT_PROJECT_ID');
    expect(TEST_ROOT_ENV).not.toHaveProperty('AUDIT_PROJECT_ID_ENV');
    expect(TEST_ROOT_ENV).not.toHaveProperty('AUDIT_PROJECT_ID_DEFAULT');
    expect(Object.keys(process.env).filter((key) => key.includes('GRAVESHIFT_PROJECT_ID'))).toEqual(
      [],
    );
    // Boot and one audited attempt succeed with no project id in the environment at all.
    await request(app.getHttpServer())
      .post('/api/work-items/work-1/fix-now')
      .auth(fix.token('client-1', '12345'), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(fix.audit.entries('12345')).toHaveLength(1);
  });
});
