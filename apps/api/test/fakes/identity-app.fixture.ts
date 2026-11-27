import type { INestApplication } from '@nestjs/common';
import { createInMemoryPublisher } from '@graveshift/events/testing';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import { AUDIT_READER, AUDIT_SINK } from '../../src/audit/audit.sink';
import { AuditRepo } from '../../src/audit/audit.repo';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../../src/auth/auth.types';
import { PrismaCredentialRepo } from '../../src/auth/repo/credential.repo';
import { BOOT_CONFIG, type RootBootConfig } from '../../src/config/boot.config';
import { IDENTITY_REPO } from '../../src/identity/identity.types';
import { PrismaIdentityRepo } from '../../src/identity/repo/identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { seedAuthIdentity } from '../database/auth.fixture';
import { openTestDatabase, resetDatabase } from '../database/fixtures';
import { TEST_CONFIG, testBootConfig } from './auth-test-config';

export const IDENTITY_ROOT = {
  email: 'root@identity.test',
  password: 'root-only-test-password',
  orgName: 'Root Org',
  orgSlug: 'root-org',
};

export interface IdentityTestApp {
  app: INestApplication;
  identity: PrismaIdentityRepo;
  db: PrismaService;
  jwt: JwtService;
  boot: RootBootConfig;
}

let db: PrismaService;
let audit: AuditRepo;
let identity: PrismaIdentityRepo;
const opened: IdentityTestApp[] = [];

/** One guarded database per identity suite; every store is a real repository. */
export function setupIdentityDatabase(): void {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  afterAll(async () => db?.onModuleDestroy());
}

export async function closeIdentityApps(): Promise<void> {
  await Promise.all(opened.map((context) => context.app.close()));
  opened.length = 0;
}

export async function buildIdentityApp(
  withRoot = false,
  seed?: (db: PrismaService) => Promise<void>,
): Promise<IdentityTestApp> {
  if (db === undefined || audit === undefined)
    throw new Error('buildIdentityApp needs the database-backed identity store');
  // Each build gets a fresh store so a test can stage a competing root without
  // leaking it into the next app built in the same test.
  await resetDatabase(db);
  identity = await seedAuthIdentity(db);
  await seed?.(db);
  const base = await testBootConfig();
  const boot: RootBootConfig = withRoot ? { ...base, rootAdmin: IDENTITY_ROOT } : { ...base };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BOOT_CONFIG)
    .useValue(boot)
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
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const context = { app, identity, db, jwt: moduleRef.get(JwtService), boot };
  opened.push(context);
  return context;
}

export const http = (context: IdentityTestApp) => request(context.app.getHttpServer());
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function registerAndLogin(
  context: IdentityTestApp,
  email: string,
  password = 'account-test-password',
): Promise<string> {
  await http(context).post('/api/register').send({ email, password }).expect(201);
  const login = await http(context).post('/api/auth/login').send({ email, password }).expect(201);
  return login.body.access_token as string;
}
