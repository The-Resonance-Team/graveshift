import { afterEach, describe, expect, test } from 'bun:test';

import { IdentityService } from '../src/identity/services/identity.service';
import { MIGRATED_ORG_ID } from '../src/identity/identity.types';
import type { FakeIdentityRepo } from '../src/identity/testing/fake-identity.repo';
import {
  bearer,
  buildIdentityApp,
  closeIdentityApps,
  http,
  registerAndLogin,
} from './fakes/identity-app.fixture';

afterEach(closeIdentityApps);

const migratedOrg = async (identity: FakeIdentityRepo): Promise<void> => {
  await identity.addOrganization({ id: MIGRATED_ORG_ID, name: 'Migrated', slug: 'migrated' });
  await identity.addProject({
    projectId: '1000',
    orgId: MIGRATED_ORG_ID,
    name: 'Migrated Project',
    slug: 'migrated-1000',
  });
};

describe('identity security boundaries (e2e)', () => {
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
});
