import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO, EVENT_PUBLISHER } from '../src/auth/auth.types';
import { BOOT_CONFIG, type RootBootConfig } from '../src/config/boot.config';
import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO } from '../src/identity/identity.types';
import { IdentityService } from '../src/identity/services/identity.service';
import { FakeIdentityRepo } from '../src/identity/testing/fake-identity.repo';
import {
  TEST_CONFIG,
  TEST_ROOT_ENV,
  testBootConfig,
  testOAuthClients,
} from './fakes/auth-test-config';
import { FakeCredentialRepo } from './fakes/fake-credential-repo';
import { createInMemoryPublisher } from '@graveshift/events/testing';

const ROOT = {
  email: 'root@identity.test',
  password: 'root-only-test-password',
  orgName: 'Root Org',
  orgSlug: 'root-org',
};

interface Context {
  app: INestApplication;
  identity: FakeIdentityRepo;
  jwt: JwtService;
  boot: RootBootConfig;
}

let contexts: Context[] = [];

async function build(withRoot = false): Promise<Context> {
  const identity = new FakeIdentityRepo();
  await Promise.all(
    testOAuthClients().map((client) => identity.clients.set(client.clientId, client)),
  );
  void identity.grants.set(DEFAULT_DAEMON_GRANT, {
    id: 'test-grant',
    name: DEFAULT_DAEMON_GRANT,
    projectIds: [],
  });
  const base = await testBootConfig();
  const boot: RootBootConfig = withRoot ? { ...base, rootAdmin: ROOT } : { ...base };
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
  contexts.push(context);
  return context;
}

afterEach(async () => {
  await Promise.all(contexts.map((context) => context.app.close()));
  contexts = [];
});

const http = (context: Context) => request(context.app.getHttpServer());
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function account(context: Context, email: string, password = 'account-test-password') {
  await http(context).post('/api/register').send({ email, password }).expect(201);
  const login = await http(context).post('/api/auth/login').send({ email, password }).expect(201);
  return login.body.access_token as string;
}

describe('account and organization identity (e2e)', () => {
  test('register creates an Account with no Organization and no admin role', async () => {
    const context = await build();
    const token = await account(context, 'new@identity.test');
    const profile = await http(context).get('/api/account/profile').set(bearer(token)).expect(200);
    expect(profile.body.email).toBe('new@identity.test');
    expect(profile.body.organizations).toEqual([]);
    expect(profile.body.mustChangePassword).toBe(false);
  });

  test('onboarding creates an Organization and an owner Membership', async () => {
    const context = await build();
    const token = await account(context, 'onboard@identity.test');
    const result = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'First Org', slug: 'first-org' })
      .expect(200);
    expect(result.body.organizations).toEqual([{ orgId: expect.any(String), role: 'owner' }]);
    const repeated = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Second Org', slug: 'second-org' })
      .expect(409);
    expect(repeated.body.statusCode).toBe(409);
  });

  test('two Organizations can exist on one deployment', async () => {
    const context = await build();
    const token = await account(context, 'multi@identity.test');
    await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'One', slug: 'one' })
      .expect(200);
    const second = await http(context)
      .post('/api/organizations')
      .set(bearer(token))
      .send({ name: 'Two', slug: 'two' })
      .expect(201);
    expect(second.body.slug).toBe('two');
    const profile = await http(context).get('/api/account/profile').set(bearer(token)).expect(200);
    expect(profile.body.organizations).toHaveLength(2);
  });

  test('credentials are scoped to each Organization Project and a foreign Project is 403', async () => {
    const context = await build();
    const token = await account(context, 'owner@identity.test');
    const first = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Alpha', slug: 'alpha' })
      .expect(200);
    const second = await http(context)
      .post('/api/organizations')
      .set(bearer(token))
      .send({ name: 'Beta', slug: 'beta' })
      .expect(201);
    const orgA = first.body.organizations[0].orgId as string;
    const orgB = second.body.id as string;

    const projectA = await http(context)
      .post(`/api/organizations/${orgA}/projects`)
      .set(bearer(token))
      .send({ name: 'Alpha Project', slug: 'alpha-project' })
      .expect(201);
    const projectB = await http(context)
      .post(`/api/organizations/${orgB}/projects`)
      .set(bearer(token))
      .send({ name: 'Beta Project', slug: 'beta-project' })
      .expect(201);
    expect(projectA.body.projectId).toMatch(/^\d+$/);
    expect(projectB.body.projectId).toMatch(/^\d+$/);
    expect(projectA.body.projectId).not.toBe(projectB.body.projectId);

    const grants = [
      [orgA, projectA.body.projectId as string],
      [orgB, projectB.body.projectId as string],
    ] as const;
    const issued = await Promise.all(
      grants.map(async ([orgId, projectId]) => {
        const client = await http(context)
          .post(`/api/organizations/${orgId}/oauth-clients`)
          .set(bearer(token))
          .send({ projectId, scopes: ['project:read'] })
          .expect(201);
        const tokenResponse = await http(context)
          .post('/api/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: client.body.clientId,
            client_secret: client.body.clientSecret,
          })
          .expect(200);
        return { projectId, accessToken: tokenResponse.body.access_token as string };
      }),
    );
    for (const { projectId, accessToken } of issued) {
      const payload = context.jwt.verify<{ projectId: string }>(accessToken, {
        secret: TEST_CONFIG.jwtSecret,
        issuer: TEST_CONFIG.jwtIssuer,
        audience: TEST_CONFIG.jwtAudience,
        algorithms: ['HS256'],
      });
      expect(payload.projectId).toBe(projectId);
    }

    const foreign = await http(context)
      .post(`/api/organizations/${orgA}/oauth-clients`)
      .set(bearer(token))
      .send({ projectId: projectB.body.projectId, scopes: ['project:read'] })
      .expect(403);
    expect(foreign.body.statusCode).toBe(403);
  });

  test('no host-wide Project value exists in boot or internal config', async () => {
    const context = await build(true);
    await context.app.get(IdentityService).bootstrap();
    expect(context.boot).not.toHaveProperty('projectId');
    expect(TEST_ROOT_ENV).not.toHaveProperty('GRAVESHIFT_PROJECT_ID');
    const internal = await http(context)
      .get('/internal/config')
      .set('authorization', `Bearer ${TEST_ROOT_ENV.GRAVESHIFT_API_INTERNAL_TOKEN}`)
      .expect(200);
    expect(internal.body).toHaveProperty('projectIds');
    expect(internal.body).not.toHaveProperty('projectId');
  });

  test('root admin comes only from env and changes its password at first login', async () => {
    const context = await build(true);
    const service = context.app.get(IdentityService);
    await service.bootstrap();
    expect(await context.identity.countAccounts()).toBe(1);
    await service.bootstrap();
    expect(await context.identity.countAccounts()).toBe(1);

    const login = await http(context)
      .post('/api/auth/login')
      .send({ email: ROOT.email, password: ROOT.password })
      .expect(201);
    const token = login.body.access_token as string;
    const profile = await http(context).get('/api/account/profile').set(bearer(token)).expect(200);
    expect(profile.body.mustChangePassword).toBe(true);
    expect(profile.body.organizations).toHaveLength(1);

    await http(context)
      .post('/api/organizations')
      .set(bearer(token))
      .send({ name: 'Blocked', slug: 'blocked' })
      .expect(403);

    await http(context)
      .post('/api/account/change-password')
      .set(bearer(token))
      .send({ currentPassword: ROOT.password, newPassword: 'changed-root-password-123' })
      .expect(200);

    const after = await http(context)
      .post('/api/organizations')
      .set(bearer(token))
      .send({ name: 'Allowed', slug: 'allowed' })
      .expect(201);
    expect(after.body.slug).toBe('allowed');
  });
});
