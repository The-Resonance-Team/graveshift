import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { IdentityConflictError } from '../../src/identity/identity.types';
import { PrismaIdentityRepo } from '../../src/identity/repo/identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase } from './fixtures';

async function clearIdentity(db: PrismaService): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "oauth_clients"');
  await db.$executeRawUnsafe('DELETE FROM "projects"');
  await db.$executeRawUnsafe('DELETE FROM "memberships"');
  await db.$executeRawUnsafe('DELETE FROM "daemon_grants"');
  await db.$executeRawUnsafe('DELETE FROM "organizations"');
  await db.$executeRawUnsafe('DELETE FROM "accounts"');
}

describe.skipIf(!dbTestEnabled)('identity repository over PostgreSQL', () => {
  let db: PrismaService;
  let repo: PrismaIdentityRepo;

  beforeAll(async () => {
    db = await openTestDatabase();
    repo = new PrismaIdentityRepo(db);
  });

  afterAll(async () => {
    await clearIdentity(db);
    await db?.onModuleDestroy();
  });

  test('bootstrapRoot rolls back every write when one statement fails', async () => {
    await clearIdentity(db);
    // The duplicate slug makes the organization insert fail after the account
    // insert. The single transaction must remove the account as well.
    await db.organization.create({ data: { id: 'seed-org', name: 'Seed', slug: 'root-org' } });
    const root = {
      email: 'root@db.test',
      passwordHash: 'test-only-hash',
      mustChangePassword: true,
      orgName: 'Root',
      orgSlug: 'root-org',
    };
    await expect(repo.bootstrapRoot(root)).rejects.toBeInstanceOf(IdentityConflictError);
    expect(await repo.countAccounts()).toBe(0);
    expect(await repo.findOrganizationBySlug('root-org')).toBeDefined();
  });

  test('unique violations map to IdentityConflictError for accounts and projects', async () => {
    await clearIdentity(db);
    const account = await repo.addAccount({
      email: 'duplicate@db.test',
      passwordHash: 'test-only-hash',
      mustChangePassword: false,
    });
    expect(account.email).toBe('duplicate@db.test');
    await expect(
      repo.addAccount({
        email: 'duplicate@db.test',
        passwordHash: 'test-only-hash',
        mustChangePassword: false,
      }),
    ).rejects.toBeInstanceOf(IdentityConflictError);

    const org = await repo.addOrganization({ name: 'Org', slug: 'repo-org' });
    const project = {
      projectId: '3001',
      orgId: org.id,
      name: 'Project',
      slug: 'repo-project',
    };
    await repo.addGrant({ id: 'grant-1', name: 'default', projectIds: [] });
    expect((await repo.createProjectWithGrant(project, 'default')).projectId).toBe('3001');
    await expect(repo.createProjectWithGrant(project, 'default')).rejects.toBeInstanceOf(
      IdentityConflictError,
    );
  });

  test('createProjectWithGrant uses an atomic array_append without duplicates', async () => {
    await clearIdentity(db);
    const org = await repo.addOrganization({ name: 'Grant Org', slug: 'grant-org' });
    await repo.addGrant({ id: 'grant-2', name: 'default', projectIds: [] });
    const first = { projectId: '4001', orgId: org.id, name: 'First', slug: 'first' };
    const second = { projectId: '4002', orgId: org.id, name: 'Second', slug: 'second' };
    await repo.createProjectWithGrant(first, 'default');
    await repo.createProjectWithGrant(second, 'default');
    const grant = await repo.findGrant('default');
    expect(grant?.projectIds.sort()).toEqual(['4001', '4002']);
  });
});
