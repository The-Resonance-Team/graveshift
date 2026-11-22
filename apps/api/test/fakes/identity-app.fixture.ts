import type { INestApplication } from '@nestjs/common';
import { createInMemoryPublisher } from '@graveshift/events/testing';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../../src/auth/auth.types';
import { BOOT_CONFIG, type RootBootConfig } from '../../src/config/boot.config';
import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO } from '../../src/identity/identity.types';
import { FakeIdentityRepo } from '../../src/identity/testing/fake-identity.repo';
import { TEST_CONFIG, testBootConfig, testOAuthClients } from './auth-test-config';
import { FakeCredentialRepo } from './fake-credential-repo';

export const IDENTITY_ROOT = {
  email: 'root@identity.test',
  password: 'root-only-test-password',
  orgName: 'Root Org',
  orgSlug: 'root-org',
};

export interface IdentityTestApp {
  app: INestApplication;
  identity: FakeIdentityRepo;
  jwt: JwtService;
  boot: RootBootConfig;
}

const opened: IdentityTestApp[] = [];

export async function closeIdentityApps(): Promise<void> {
  await Promise.all(opened.map((context) => context.app.close()));
  opened.length = 0;
}

export async function buildIdentityApp(
  withRoot = false,
  seed?: (identity: FakeIdentityRepo) => Promise<void>,
): Promise<IdentityTestApp> {
  const identity = new FakeIdentityRepo();
  for (const client of testOAuthClients()) identity.clients.set(client.clientId, client);
  identity.grants.set(DEFAULT_DAEMON_GRANT, {
    id: 'test-grant',
    name: DEFAULT_DAEMON_GRANT,
    projectIds: [],
  });
  await seed?.(identity);
  const base = await testBootConfig();
  const boot: RootBootConfig = withRoot ? { ...base, rootAdmin: IDENTITY_ROOT } : { ...base };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BOOT_CONFIG)
    .useValue(boot)
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(TEST_CONFIG)
    .overrideProvider(CREDENTIAL_REPO)
    .useValue(new FakeCredentialRepo())
    .overrideProvider(EVENT_PUBLISHER)
    .useValue(createInMemoryPublisher())
    .overrideProvider(IDENTITY_REPO)
    .useValue(identity)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const context = { app, identity, jwt: moduleRef.get(JwtService), boot };
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
