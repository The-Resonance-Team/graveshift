import { WORK_COMMANDS, type WorkCommands } from '@graveshift/work';
import {
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';

import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { seedAuthIdentity } from '../../../test/database/auth.fixture';
import { openTestDatabase, resetDatabase } from '../../../test/database/fixtures';
import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { CREDENTIAL_CONFIG } from '../../auth/auth.types';
import { OAuthClientCredentialsStrategy } from '../../auth/oauth-client-credentials.strategy';
import { IDENTITY_REPO, type IdentityRepo } from '../../identity/identity.types';
import { PrismaIdentityRepo } from '../../identity/repo/identity.repo';
import { AuditedWorkCommands, WORK_COMMANDS_INNER } from '../../fix/audited-work.commands';
import { AuditRepo } from '../../audit/audit.repo';
import { AUDIT_READER, AUDIT_SINK } from '../../audit/audit.sink';
import type { PrismaService } from '../../infra/prisma.service';
import { WorkItemsController } from '../controllers/work-items.controller';
import { WorkItemRepo } from '../work-item.repo';

export const DEFAULT_WORK_SCOPES = ['tokens:manage', 'fix:trigger', 'incidents:read'];

let workDb: PrismaService | undefined;
const extraClients: PrismaService[] = [];
afterAll(async () => {
  await Promise.all(extraClients.map((client) => client.onModuleDestroy()));
  extraClients.length = 0;
});

/** One isolated database per suite; the app and its repos share that client. */
export function setupWorkHttpDatabase() {
  let db: PrismaService;
  let audit: AuditRepo;
  let identity: PrismaIdentityRepo;
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    workDb = db;
  });
  // Seed only after the reset: every loaded suite registers its beforeEach in
  // the same runner, so a seed in beforeAll could collide with another suite.
  beforeEach(async () => {
    await resetDatabase(db);
    identity = await seedAuthIdentity(db);
  });
  afterAll(async () => {
    workDb = undefined;
    await db?.onModuleDestroy();
  });
  return {
    get db() {
      return db;
    },
    get audit() {
      return audit;
    },
    get identity() {
      return identity;
    },
  };
}

export async function workHttpApp(
  repo: WorkItemRepo,
  commands: WorkCommands,
  scopes: readonly string[] = DEFAULT_WORK_SCOPES,
  audit?: AuditRepo,
  identity?: IdentityRepo,
): Promise<{ app: INestApplication; token: string; audit: AuditRepo }> {
  if (audit === undefined) throw new Error('workHttpApp needs the database-backed AuditRepo');
  let store = identity;
  if (store === undefined) {
    let client = workDb;
    if (client === undefined) {
      client = await openTestDatabase();
      extraClients.push(client);
    }
    store = new PrismaIdentityRepo(client);
  }
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
      { provide: IDENTITY_REPO, useValue: store },
      { provide: WorkItemRepo, useValue: repo },
      AuditedWorkCommands,
      { provide: WORK_COMMANDS, useExisting: AuditedWorkCommands },
      { provide: WORK_COMMANDS_INNER, useValue: commands },
      { provide: AUDIT_SINK, useValue: audit },
      { provide: AUDIT_READER, useValue: audit },
    ],
  })
    // This fixture tests Work routing over HTTP, not OAuth validation. It pins
    // the authenticated project, so the real store is only a DI dependency here.
    .overrideGuard(AuthGuard('oauth-client-credentials'))
    .useValue({
      canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{
          user?: object;
          headers?: { authorization?: string };
        }>();
        if (!request.headers?.authorization?.startsWith('Bearer ')) {
          throw new UnauthorizedException();
        }
        request.user = {
          clientId: 'client-1',
          projectId: 'project-1',
          scopes: [...scopes],
        };
        return true;
      },
    })
    .compile();
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
  const token = moduleRef.get(JwtService).sign(
    { sub: 'client-1', projectId: 'project-1', scope: [...scopes] },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      expiresIn: 300,
    },
  );
  return { app, token, audit };
}
