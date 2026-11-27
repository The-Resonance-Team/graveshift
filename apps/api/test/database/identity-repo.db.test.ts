import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { IdentityConflictError } from '../../src/identity/identity.types';
import { PrismaIdentityRepo } from '../../src/identity/repo/identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { clearIdentity, dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

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

  test('the shared reset clears identity tables too, so suites cannot leak clients', async () => {
    const org = await repo.addOrganization({ name: 'Reset', slug: 'reset-org' });
    await repo.addProject({
      projectId: '9001',
      orgId: org.id,
      name: 'Reset Project',
      slug: 'reset-project',
    });
    await repo.addOAuthClient({
      clientId: 'reset-client',
      secretHash: 'test-hash-only',
      orgId: org.id,
      projectId: '9001',
      scopes: [],
    });
    expect(await db.oAuthClient.count()).toBe(1);
    await resetDatabase(db);
    expect(await db.oAuthClient.count()).toBe(0);
    expect(await db.project.count()).toBe(0);
    expect(await db.organization.count()).toBe(0);
    expect(await db.account.count()).toBe(0);
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

  test('createProjectWithGrant uses an atomic array_append under concurrent writes', async () => {
    await clearIdentity(db);
    const org = await repo.addOrganization({ name: 'Grant Org', slug: 'grant-org' });
    await repo.addGrant({ id: 'grant-2', name: 'default', projectIds: [] });
    const projects = [4001, 4002, 4003, 4004, 4005].map((id) => ({
      projectId: String(id),
      orgId: org.id,
      name: `Project ${id}`,
      slug: `project-${id}`,
    }));
    await Promise.all(projects.map((project) => repo.createProjectWithGrant(project, 'default')));
    const grant = await repo.findGrant('default');
    const ids = grant?.projectIds ?? [];
    expect(ids.sort()).toEqual(projects.map((project) => project.projectId).sort());
    expect(new Set(ids).size).toBe(projects.length);
  });
});
