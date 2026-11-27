import { afterEach, describe, expect, test } from 'bun:test';

import type { PrismaService } from '../src/infra/prisma.service';
import { IdentityService } from '../src/identity/services/identity.service';
import { MIGRATED_ORG_ID } from '../src/identity/identity.types';
import { dbTestEnabled } from './database/fixtures';
import {
  bearer,
  buildIdentityApp,
  closeIdentityApps,
  http,
  registerAndLogin,
  setupIdentityDatabase,
} from './fakes/identity-app.fixture';

afterEach(closeIdentityApps);

const migratedOrg = async (db: PrismaService): Promise<void> => {
  await db.organization.create({
    data: { id: MIGRATED_ORG_ID, name: 'Migrated', slug: 'migrated' },
  });
  await db.project.create({
    data: {
      projectId: '1000',
      orgId: MIGRATED_ORG_ID,
      name: 'Migrated Project',
      slug: 'migrated-1000',
    },
  });
};

describe.skipIf(!dbTestEnabled)('identity security boundaries (e2e)', () => {
  setupIdentityDatabase();

  test('self-registered onboarding cannot adopt or read migrated Projects', async () => {
    const context = await buildIdentityApp(false, migratedOrg);
    const token = await registerAndLogin(context, 'tenant@identity.test');
    const onboarded = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Tenant', slug: 'tenant' })
      .expect(200);
    const orgId = onboarded.body.organizations[0].orgId as string;
    expect(orgId).not.toBe(MIGRATED_ORG_ID);

    const projects = await http(context)
      .get(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .expect(200);
    expect(projects.body).toEqual([]);
    expect(await context.identity.findProject('1000')).toBeDefined();
  });

  test('root admin bootstrap adopts migrated Projects from env only', async () => {
    const context = await buildIdentityApp(true, migratedOrg);
    await context.app.get(IdentityService).bootstrap();
    expect((await context.identity.findProject('1000'))?.orgId).not.toBe(MIGRATED_ORG_ID);
  });

  test('create client rejects config:export and tokens:manage at the DTO and the service', async () => {
    const context = await buildIdentityApp();
    const token = await registerAndLogin(context, 'scope@identity.test');
    const onboarded = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Scope Org', slug: 'scope-org' })
      .expect(200);
    const orgId = onboarded.body.organizations[0].orgId as string;
    const project = await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'Scope Project', slug: 'scope-project' })
      .expect(201);
    const projectId = project.body.projectId as string;

    await Promise.all(
      ['config:export', 'tokens:manage'].map(async (scope) => {
        await http(context)
          .post(`/api/organizations/${orgId}/oauth-clients`)
          .set(bearer(token))
          .send({ projectId, scopes: [scope] })
          .expect(422);
        await expect(
          context.app
            .get(IdentityService)
            .createOAuthClient('forged-account', orgId, { projectId, scopes: [scope] } as never),
        ).rejects.toHaveProperty('status', 403);
      }),
    );
  });

  test('create client rejects ttlSeconds because the field is not part of the contract', async () => {
    const context = await buildIdentityApp();
    const token = await registerAndLogin(context, 'ttl@identity.test');
    const onboarded = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Ttl Org', slug: 'ttl-org' })
      .expect(200);
    const orgId = onboarded.body.organizations[0].orgId as string;
    const project = await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'Ttl Project', slug: 'ttl-project' })
      .expect(201);
    const response = await http(context)
      .post(`/api/organizations/${orgId}/oauth-clients`)
      .set(bearer(token))
      .send({ projectId: project.body.projectId, scopes: ['project:read'], ttlSeconds: 3600 });
    expect(response.status).toBe(422);
  });

  test('a duplicate Organization slug returns 409 instead of 500', async () => {
    const context = await buildIdentityApp();
    const firstToken = await registerAndLogin(context, 'slug-one@identity.test');
    await http(context)
      .post('/api/onboarding/org')
      .set(bearer(firstToken))
      .send({ name: 'First', slug: 'duplicate' })
      .expect(200);
    const secondToken = await registerAndLogin(context, 'slug-two@identity.test');
    const response = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(secondToken))
      .send({ name: 'Second', slug: 'duplicate' });
    expect(response.status).toBe(409);
  });

  test('a mid-bootstrap failure leaves no partial root Account or Membership', async () => {
    // A stale Organization slug makes the second write of bootstrapRoot fail.
    // The one transaction must roll back the Account insert that came first.
    const staleOrg = async (db: PrismaService): Promise<void> => {
      await db.organization.create({ data: { name: 'Stale', slug: 'root-org' } });
    };
    const context = await buildIdentityApp(true, staleOrg);
    await expect(context.app.get(IdentityService).bootstrap()).rejects.toHaveProperty(
      'status',
      409,
    );
    expect(await context.identity.countAccounts()).toBe(0);
    expect(await context.db.membership.count()).toBe(0);
  });

  test('a competing bootstrap winner is a no-op but a stale root slug is not', async () => {
    const winner = await buildIdentityApp(true);
    await winner.db.account.create({
      data: {
        email: 'winner@identity.test',
        passwordHash: 'test-only-hash',
        mustChangePassword: true,
      },
    });
    await expect(winner.app.get(IdentityService).bootstrap()).resolves.toBeUndefined();
    expect(await winner.identity.countAccounts()).toBe(1);

    const staleOrg = async (db: PrismaService): Promise<void> => {
      await db.organization.create({ data: { name: 'Stale', slug: 'root-org' } });
    };
    const stale = await buildIdentityApp(true, staleOrg);
    await expect(stale.app.get(IdentityService).bootstrap()).rejects.toHaveProperty('status', 409);
    expect(await stale.identity.countAccounts()).toBe(0);
  });

  test('duplicate email and duplicate Project slug return 409 instead of 500', async () => {
    const context = await buildIdentityApp();
    await http(context)
      .post('/api/register')
      .send({ email: 'duplicate@identity.test', password: 'account-test-password' })
      .expect(201);
    const duplicate = await http(context)
      .post('/api/register')
      .send({ email: 'duplicate@identity.test', password: 'account-test-password' });
    expect(duplicate.status).toBe(409);

    const token = await registerAndLogin(context, 'project-owner@identity.test');
    const onboarded = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Owner Org', slug: 'owner-org' })
      .expect(200);
    const orgId = onboarded.body.organizations[0].orgId as string;
    await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'One', slug: 'same-slug' })
      .expect(201);
    const repeated = await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'Two', slug: 'same-slug' });
    expect(repeated.status).toBe(409);
    expect(await context.identity.listProjects(orgId)).toHaveLength(1);
  });

  test('a created Project is in the stored grant and a failed create adds no grant entry', async () => {
    const context = await buildIdentityApp();
    const token = await registerAndLogin(context, 'grant@identity.test');
    const onboarded = await http(context)
      .post('/api/onboarding/org')
      .set(bearer(token))
      .send({ name: 'Grant Org', slug: 'grant-org' })
      .expect(200);
    const orgId = onboarded.body.organizations[0].orgId as string;
    const created = await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'Granted', slug: 'granted' })
      .expect(201);
    const grant = await context.identity.findGrant('default');
    expect(grant?.projectIds).toContain(created.body.projectId);

    await http(context)
      .post(`/api/organizations/${orgId}/projects`)
      .set(bearer(token))
      .send({ name: 'Duplicate', slug: 'granted' })
      .expect(409);
    const after = await context.identity.findGrant('default');
    expect(after?.projectIds).toEqual(grant?.projectIds);
  });
});
