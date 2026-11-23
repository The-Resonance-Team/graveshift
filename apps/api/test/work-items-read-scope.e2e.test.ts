import { HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { CREDENTIAL_CONFIG } from '../src/auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../src/auth/oauth-client-credentials.strategy';
import { AUDIT_SINK } from '../src/audit/audit.sink';
import { InMemoryAuditSink } from '../src/audit/testing/in-memory-audit.sink';
import { AuditedWorkCommands, WORK_COMMANDS_INNER } from '../src/fix/audited-work.commands';
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { WORK_COMMANDS } from '@graveshift/work';
import { WorkItemsController } from '../src/work-items/controllers/work-items.controller';
import { WorkItemRepo } from '../src/work-items/work-item.repo';
import { TEST_CONFIG } from './fakes/auth-test-config';
import { testIdentityRepo } from './fakes/auth-test-helpers';
import { fakeWorkApi } from './fakes/fake-fix-deps';

const PATHS = ['/api/work-items', '/api/work-items/work-1', '/api/work-items/work-1/routing'];

describe('Work-item read scope', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const token = (scope: string[]) =>
    jwt.sign(
      { sub: 'client-1', projectId: '12345', scope },
      {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        expiresIn: 300,
      },
    );

  beforeEach(async () => {
    const adapter = fakeWorkApi({ projectId: '12345' });
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [WorkItemsController],
      providers: [
        OAuthClientCredentialsStrategy,
        { provide: CREDENTIAL_CONFIG, useValue: TEST_CONFIG },
        { provide: IDENTITY_REPO, useValue: testIdentityRepo() },
        { provide: WorkItemRepo, useValue: adapter.repo },
        AuditedWorkCommands,
        { provide: WORK_COMMANDS, useExisting: AuditedWorkCommands },
        { provide: WORK_COMMANDS_INNER, useValue: adapter.commands },
        { provide: AUDIT_SINK, useValue: new InMemoryAuditSink() },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterEach(async () => app.close());

  test('a token without incidents:read gets 403 on every GET route', async () => {
    const readerless = token(['tokens:manage', 'fix:trigger']);
    await Promise.all(
      PATHS.map((path) =>
        request(app.getHttpServer()).get(path).auth(readerless, { type: 'bearer' }).expect(403),
      ),
    );
  });

  test('a token with incidents:read succeeds on every GET route', async () => {
    const reader = token(['tokens:manage', 'incidents:read']);
    const results = await Promise.all(
      PATHS.map((path) =>
        request(app.getHttpServer()).get(path).auth(reader, { type: 'bearer' }).expect(200),
      ),
    );
    expect(results).toHaveLength(3);
  });
});
