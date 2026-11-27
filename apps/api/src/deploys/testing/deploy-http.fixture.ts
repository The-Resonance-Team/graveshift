import 'reflect-metadata';

import { createInMemoryPublisher } from '@graveshift/events/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach } from 'bun:test';
import request from 'supertest';

import { TEST_CONFIG, testBootConfig } from '../../../test/fakes/auth-test-config';
import { openTestDatabase, resetDatabase } from '../../../test/database/fixtures';
import { configureApp } from '../../app.factory';
import { AppModule } from '../../app.module';
import { AUDIT_READER, AUDIT_SINK } from '../../audit/audit.sink';
import { AuditRepo } from '../../audit/audit.repo';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../../auth/auth.types';
import { expandScopes } from '../../auth/scopes';
import { PrismaCredentialRepo } from '../../auth/repo/credential.repo';
import { BOOT_CONFIG } from '../../config/boot.config';
import { IDENTITY_REPO } from '../../identity/identity.types';
import { PrismaIdentityRepo } from '../../identity/repo/identity.repo';
import type { PrismaService } from '../../infra/prisma.service';
import { DeployRepo } from '../deploy.repo';

export interface DeployTestContext {
  app: INestApplication;
  identity: PrismaIdentityRepo;
  jwt: JwtService;
  deploys: DeployRepo;
  db: PrismaService;
  audit: AuditRepo;
  orgA: string;
  orgB: string;
  projectA: string;
  projectA2: string;
  projectB: string;
  clientA: string;
  clientA2: string;
  clientB: string;
  ciClient: string;
  orgCiClient: string;
}

let db: PrismaService;
let audit: AuditRepo;
let identity: PrismaIdentityRepo;
let deploys: DeployRepo;
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

/** One guarded database per suite; every repo shares that client. */
export function setupDeployDatabase(): void {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    identity = new PrismaIdentityRepo(db);
    deploys = new DeployRepo(db, audit);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    await db.organization.createMany({
      data: [
        { id: ORG_A, name: 'Alpha', slug: 'alpha' },
        { id: ORG_B, name: 'Beta', slug: 'beta' },
      ],
    });
    const projects = [
      ['1001', ORG_A, 'First', 'first'],
      ['1002', ORG_A, 'Second', 'second'],
      ['2001', ORG_B, 'Foreign', 'foreign'],
    ] as const;
    await Promise.all(
      projects.map(([projectId, orgId, name, slug]) =>
        db.project.create({ data: { projectId, orgId, name, slug } }),
      ),
    );
    const clients = [
      ['deploy-client-a', ORG_A, '1001', ['org:read', 'project:read', 'project:write', 'org:ci']],
      ['deploy-client-b', ORG_B, '2001', ['org:read', 'project:read', 'project:write', 'org:ci']],
      ['deploy-client-ci', ORG_A, '1001', ['org:ci']],
      ['deploy-client-a2', ORG_A, '1002', ['project:read']],
      [
        'deploy-client-org-ci',
        ORG_A,
        '1001',
        ['org:read', 'org:ci', 'project:read', 'project:write'],
      ],
    ] as const;
    await Promise.all(
      clients.map(([clientId, orgId, projectId, scopes]) =>
        identity.addOAuthClient({
          clientId,
          secretHash: 'test-hash-only',
          orgId,
          projectId,
          scopes: expandScopes([...scopes]),
        }),
      ),
    );
  });
  afterAll(async () => db?.onModuleDestroy());
}

/** Builds the real HTTP app over the guarded database. No in-memory store is used. */
export async function buildDeployTestApp(): Promise<DeployTestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BOOT_CONFIG)
    .useValue(await testBootConfig())
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(TEST_CONFIG)
    .overrideProvider(CREDENTIAL_REPO)
    .useValue(new PrismaCredentialRepo(db, audit))
    .overrideProvider(EVENT_PUBLISHER)
    .useValue(createInMemoryPublisher())
    .overrideProvider(IDENTITY_REPO)
    .useValue(identity)
    .overrideProvider(AUDIT_SINK)
    .useValue(audit)
    .overrideProvider(AUDIT_READER)
    .useValue(audit)
    .overrideProvider(DeployRepo)
    .useValue(deploys)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  return {
    app,
    identity,
    jwt: moduleRef.get(JwtService),
    deploys,
    db,
    audit,
    orgA: ORG_A,
    orgB: ORG_B,
    projectA: '1001',
    projectA2: '1002',
    projectB: '2001',
    clientA: 'deploy-client-a',
    clientA2: 'deploy-client-a2',
    clientB: 'deploy-client-b',
    ciClient: 'deploy-client-ci',
    orgCiClient: 'deploy-client-org-ci',
  };
}

export const http = (context: DeployTestContext) => request(context.app.getHttpServer());
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Signs a test-only OAuth client token with the test issuer and audience. */
export async function clientToken(
  context: DeployTestContext,
  clientId: string,
  projectId: string,
  scopes: string[],
): Promise<string> {
  return context.jwt.signAsync(
    { sub: clientId, projectId, scope: scopes },
    {
      secret: TEST_CONFIG.jwtSecret,
      issuer: TEST_CONFIG.jwtIssuer,
      audience: TEST_CONFIG.jwtAudience,
      algorithm: 'HS256',
      expiresIn: 3600,
    },
  );
}
