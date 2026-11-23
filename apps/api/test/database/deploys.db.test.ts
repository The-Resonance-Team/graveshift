import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/repo/audit.repo';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import { EnvironmentRepo } from '../../src/environments/environment.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

/** PrismaPromise is lazy on Linux Bun; resolve it before handing it to a matcher. */
const rejects = (promise: PromiseLike<unknown>) => expect(Promise.resolve(promise));

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe.skipIf(!dbTestEnabled)('v3 deployment database rules', () => {
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
    const environment = await db.environment.create({
      data: { orgId: orgA.id, name: 'production' },
    });
    const deploy = await db.deploy.create({
      data: {
        orgId: orgA.id,
        projectId: '1001',
        environmentId: environment.id,
        deploymentId: SHA,
        title: 'deploy-1',
        dateStarted: new Date('2026-11-22T07:00:00.000Z'),
      },
    });
    return { orgA, orgB, environment, deploy };
  }

  test('database rejects UPDATE and DELETE on deploys', async () => {
    const { deploy } = await seed();
    await rejects(
      db.deploy.update({ where: { id: deploy.id }, data: { title: 'changed' } }),
    ).rejects.toThrow(/append-only/);
    await rejects(db.deploy.delete({ where: { id: deploy.id } })).rejects.toThrow(/append-only/);
    expect(await db.deploy.count()).toBe(1);
  });

  test('parent deletes cannot cascade away a deployment', async () => {
    const { orgA, environment } = await seed();
    await rejects(db.organization.delete({ where: { id: orgA.id } })).rejects.toThrow();
    await rejects(db.environment.delete({ where: { id: environment.id } })).rejects.toThrow();
    await rejects(db.project.delete({ where: { projectId: '1001' } })).rejects.toThrow();
    expect(await db.deploy.count()).toBe(1);
  });

  test('organization triggers reject cross-Organization links', async () => {
    const { orgA, orgB } = await seed();
    const foreignEnvironment = await db.environment.create({
      data: { orgId: orgB.id, name: 'foreign-env' },
    });
    await rejects(
      db.deploy.create({
        data: {
          orgId: orgB.id,
          projectId: '1001',
          environmentId: foreignEnvironment.id,
          deploymentId: 'b'.repeat(40),
          title: 'foreign-project',
          dateStarted: new Date(),
        },
      }),
    ).rejects.toThrow(/deploy project belongs to another organization/);
    await rejects(
      db.deploy.create({
        data: {
          orgId: orgA.id,
          projectId: '1001',
          environmentId: foreignEnvironment.id,
          deploymentId: 'b'.repeat(40),
          title: 'foreign-environment',
          dateStarted: new Date(),
        },
      }),
    ).rejects.toThrow(/deploy environment belongs to another organization/);
  });

  test('organization scope columns are immutable while linked', async () => {
    const { orgB, environment } = await seed();
    await rejects(
      db.environment.update({ where: { id: environment.id }, data: { orgId: orgB.id } }),
    ).rejects.toThrow(/immutable/);
    await rejects(
      db.project.update({ where: { projectId: '1001' }, data: { orgId: orgB.id } }),
    ).rejects.toThrow(/immutable while linked/);
  });

  test('a concurrent Environment first use writes one audit entry', async () => {
    const { orgA } = await seed();
    const repo = new EnvironmentRepo(db, audit);
    const input = {
      orgId: orgA.id,
      name: 'staging',
      projectId: '1001',
      deploymentId: SHA,
      actor: 'test-client',
    };
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => repo.createWithAudit(input)),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const created = results.filter(
      (result) => result.status === 'fulfilled' && result.value.created,
    );
    expect(created).toHaveLength(1);
    expect(await db.environment.count({ where: { orgId: orgA.id, name: 'staging' } })).toBe(1);
    expect(
      await db.auditEntry.count({
        where: { projectId: '1001', type: 'environment.created' },
      }),
    ).toBe(1);
  });

  test('the database rejects a duplicate Project, SHA and Environment tuple', async () => {
    const { orgA, environment } = await seed();
    await rejects(
      db.deploy.create({
        data: {
          orgId: orgA.id,
          projectId: '1001',
          environmentId: environment.id,
          deploymentId: SHA,
          title: 'duplicate',
          dateStarted: new Date(),
        },
      }),
    ).rejects.toHaveProperty('code', 'P2002');
  });

  test('the Deploy URL CHECK accepts https and rejects other schemes', async () => {
    const { orgA, environment } = await seed();
    const insert = (url: string, sha: string) =>
      db.deploy.create({
        data: {
          orgId: orgA.id,
          projectId: '1001',
          environmentId: environment.id,
          deploymentId: sha,
          title: `url-probe-${sha[0]}`,
          dateStarted: new Date(),
          url,
        },
      });
    const rejected = await Promise.allSettled([
      insert('javascript:alert(1)', 'c'.repeat(40)),
      insert('ftp://example.test/file', 'd'.repeat(40)),
    ]);
    expect(
      rejected.every(
        (result) =>
          result.status === 'rejected' && /deploys_url_http_check/.test(String(result.reason)),
      ),
    ).toBe(true);
    const accepted = await insert('https://ci.example.test/runs/42', 'e'.repeat(40));
    expect(accepted.url).toBe('https://ci.example.test/runs/42');
    expect(await db.deploy.count()).toBe(2);
  });

  test('writes one audit entry per Deployment with the SHA column set', async () => {
    const { orgA } = await seed();
    const environmentRepo = new EnvironmentRepo(db, audit);
    const deployRepo = new DeployRepo(db, audit);
    const { record: environment } = await environmentRepo.createWithAudit({
      orgId: orgA.id,
      name: 'staging',
      projectId: '1001',
      deploymentId: 'f'.repeat(40),
      actor: 'test-client',
    });
    await deployRepo.append({
      orgId: orgA.id,
      projectId: '1001',
      environmentId: environment.id,
      environment: environment.name,
      deploymentId: 'f'.repeat(40),
      title: 'deploy-2',
      dateStarted: new Date(),
      actor: 'test-client',
    });
    const entries = await db.auditEntry.findMany({ orderBy: { seq: 'asc' } });
    expect(entries.map((entry) => [entry.projectId, entry.type])).toEqual([
      ['1001', 'environment.created'],
      ['1001', 'deploy.created'],
    ]);
    const environmentCreated = entries[0];
    expect(environmentCreated?.payload).toMatchObject({ deploymentId: 'f'.repeat(40) });
    const created = entries[1];
    expect(created?.payload).toMatchObject({
      deploymentId: 'f'.repeat(40),
      projectId: '1001',
      orgId: orgA.id,
      title: 'deploy-2',
      environment: 'staging',
    });
  });

  test('closure sets closedAt once and writes one deployment.closed entry', async () => {
    const { deploy } = await seed();
    const repo = new DeployRepo(db, audit);
    expect(await repo.closeFirst('1001', SHA, 'production')).toBe(true);
    expect(await repo.closeFirst('1001', SHA, 'production')).toBe(false);
    const stored = await db.deploy.findUniqueOrThrow({ where: { id: deploy.id } });
    expect(stored.closedAt).not.toBeNull();
    expect(await repo.listClosed('1001')).toEqual([
      { deploymentId: SHA, environment: 'production' },
    ]);
    expect(
      await db.auditEntry.count({ where: { projectId: '1001', type: 'deployment.closed' } }),
    ).toBe(1);
    const entry = await db.auditEntry.findFirstOrThrow({
      where: { projectId: '1001', type: 'deployment.closed' },
    });
    expect(entry.payload).toMatchObject({ deploymentId: SHA });
    await rejects(
      db.deploy.update({ where: { id: deploy.id }, data: { closedAt: new Date() } }),
    ).rejects.toThrow(/append-only/);
  });

  test('an Environment and its audit entry commit in one transaction', async () => {
    const { orgA } = await seed();
    const failing = {
      appendInTransaction: async () => {
        throw new Error('audit unavailable');
      },
    } as unknown as AuditRepo;
    await expect(
      new EnvironmentRepo(db, failing).createWithAudit({
        orgId: orgA.id,
        name: 'staging',
        projectId: '1001',
        deploymentId: SHA,
        actor: 'test-client',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await db.environment.count({ where: { orgId: orgA.id, name: 'staging' } })).toBe(0);
    expect(await db.auditEntry.count()).toBe(0);
  });

  test('an audit append failure rolls back the deploy write', async () => {
    const { orgA, environment } = await seed();
    const failing = {
      appendInTransaction: async () => {
        throw new Error('audit unavailable');
      },
    } as unknown as AuditRepo;
    await expect(
      new DeployRepo(db, failing).append({
        orgId: orgA.id,
        projectId: '1001',
        environmentId: environment.id,
        environment: environment.name,
        deploymentId: 'f'.repeat(40),
        title: 'deploy-2',
        dateStarted: new Date(),
        actor: 'test-client',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await db.deploy.count()).toBe(1);
  });
});
