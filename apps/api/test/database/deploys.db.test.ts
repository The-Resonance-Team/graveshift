import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/repo/audit.repo';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import { EnvironmentRepo } from '../../src/environments/environment.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { ReleaseRepo } from '../../src/releases/release.repo';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

describe.skipIf(!dbTestEnabled)('v3 deploy database rules', () => {
  let db: PrismaService;
  let audit: AuditRepo;

  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });

  beforeEach(async () => {
    await resetDatabase(db);
    await db.organization.deleteMany();
  });

  afterAll(async () => db.onModuleDestroy());

  async function seed() {
    const orgA = await db.organization.create({ data: { name: 'Alpha', slug: 'alpha' } });
    const orgB = await db.organization.create({ data: { name: 'Beta', slug: 'beta' } });
    await db.project.create({
      data: { projectId: '1001', orgId: orgA.id, name: 'First', slug: 'first' },
    });
    await db.project.create({
      data: { projectId: '1002', orgId: orgA.id, name: 'Second', slug: 'second' },
    });
    await db.project.create({
      data: { projectId: '2001', orgId: orgB.id, name: 'Foreign', slug: 'foreign' },
    });
    const release = await db.release.create({ data: { orgId: orgA.id, version: 'v1' } });
    await db.projectRelease.create({
      data: { releaseId: release.id, projectId: '1001' },
    });
    const environment = await db.environment.create({
      data: { orgId: orgA.id, name: 'production' },
    });
    const deploy = await db.deploy.create({
      data: {
        orgId: orgA.id,
        releaseId: release.id,
        environmentId: environment.id,
        name: 'deploy-1',
        dateStarted: new Date('2026-11-22T07:00:00.000Z'),
      },
    });
    await db.deployProject.create({ data: { deployId: deploy.id, projectId: '1001' } });
    return { orgA, orgB, release, environment, deploy };
  }

  test('database rejects UPDATE and DELETE on deploys', async () => {
    const { deploy } = await seed();
    await expect(
      db.deploy.update({ where: { id: deploy.id }, data: { name: 'changed' } }),
    ).rejects.toThrow(/append-only/);
    await expect(db.deploy.delete({ where: { id: deploy.id } })).rejects.toThrow(/append-only/);
    expect(await db.deploy.count()).toBe(1);
  });

  test('database rejects UPDATE and DELETE on deploy project links', async () => {
    const { deploy } = await seed();
    await expect(
      db.deployProject.update({
        where: { deployId_projectId: { deployId: deploy.id, projectId: '1001' } },
        data: { projectId: '1002' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.deployProject.delete({
        where: { deployId_projectId: { deployId: deploy.id, projectId: '1001' } },
      }),
    ).rejects.toThrow(/append-only/);
  });

  test('parent deletes cannot cascade away a deploy', async () => {
    const { orgA, release, environment } = await seed();
    await expect(db.organization.delete({ where: { id: orgA.id } })).rejects.toThrow();
    await expect(db.release.delete({ where: { id: release.id } })).rejects.toThrow();
    await expect(db.environment.delete({ where: { id: environment.id } })).rejects.toThrow();
    expect(await db.deploy.count()).toBe(1);
  });

  test('organization consistency triggers reject cross-Organization links', async () => {
    const { orgB, release, environment, deploy } = await seed();
    await expect(
      db.deploy.create({
        data: {
          orgId: orgB.id,
          releaseId: release.id,
          environmentId: environment.id,
          name: 'foreign',
          dateStarted: new Date(),
        },
      }),
    ).rejects.toThrow(/another organization/);
    await expect(
      db.projectRelease.create({ data: { releaseId: release.id, projectId: '2001' } }),
    ).rejects.toThrow(/another organization/);
    await expect(
      db.deployProject.create({ data: { deployId: deploy.id, projectId: '2001' } }),
    ).rejects.toThrow(/another organization/);
  });

  test('concurrent creation of the same Environment yields one row', async () => {
    const { orgA } = await seed();
    const repo = new EnvironmentRepo(db);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.findOrCreate(orgA.id, 'staging')),
    );
    expect(new Set(results.map((result) => result.record.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await db.environment.count({ where: { orgId: orgA.id, name: 'staging' } })).toBe(1);
  });

  test('a duplicate Release version is rejected by the database', async () => {
    const { orgA } = await seed();
    await expect(
      db.release.create({ data: { orgId: orgA.id, version: 'v1' } }),
    ).rejects.toHaveProperty('code', 'P2002');
  });

  test('writes append audit entries keyed by each affected Project', async () => {
    const { orgA, release, environment } = await seed();
    const releases = new ReleaseRepo(db, audit);
    const created = await releases.create({
      orgId: orgA.id,
      version: 'v2',
      projectIds: ['1001', '1002'],
      actor: 'test-client',
    });
    await new DeployRepo(db, audit).append({
      orgId: orgA.id,
      releaseId: release.id,
      environmentId: environment.id,
      name: 'deploy-2',
      dateStarted: new Date(),
      projectIds: ['1001'],
      actor: 'test-client',
      auditEnvironment: false,
    });
    const entries = await db.auditEntry.findMany({ orderBy: { seq: 'asc' } });
    expect(entries.map((entry) => [entry.projectId, entry.type])).toEqual([
      ['1001', 'release.created'],
      ['1002', 'release.created'],
      ['1001', 'deploy.created'],
    ]);
    expect(created.version).toBe('v2');
  });

  test('an audit append failure rolls back the deploy write', async () => {
    const { orgA, release, environment } = await seed();
    const failing = {
      appendInTransaction: async () => {
        throw new Error('audit unavailable');
      },
    } as unknown as AuditRepo;
    const deploys = new DeployRepo(db, failing);
    await expect(
      deploys.append({
        orgId: orgA.id,
        releaseId: release.id,
        environmentId: environment.id,
        name: 'deploy-2',
        dateStarted: new Date(),
        projectIds: ['1001'],
        actor: 'test-client',
        auditEnvironment: false,
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await db.deploy.count()).toBe(1);
  });
});
