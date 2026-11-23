import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/repo/audit.repo';
import { DeployRepo } from '../../src/deploys/deploy.repo';
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
    const deploy = await db.deploy.create({
      data: {
        projectId: '1001',
        deploymentId: SHA,
        environment: 'production',
        title: 'deploy-1',
        dateStarted: new Date('2026-11-22T07:00:00.000Z'),
      },
    });
    return { orgA, orgB, deploy };
  }

  test('a Deployment stores the Environment as a plain string', async () => {
    const { deploy } = await seed();
    expect(deploy.environment).toBe('production');
    expect(deploy).not.toHaveProperty('orgId');
    expect(deploy).not.toHaveProperty('environmentId');
  });

  test('database rejects UPDATE and DELETE on deploys', async () => {
    const { deploy } = await seed();
    await rejects(
      db.deploy.update({ where: { id: deploy.id }, data: { title: 'changed' } }),
    ).rejects.toThrow(/append-only/);
    await rejects(db.deploy.delete({ where: { id: deploy.id } })).rejects.toThrow(/append-only/);
    expect(await db.deploy.count()).toBe(1);
  });

  test('parent deletes cannot cascade away a deployment', async () => {
    const { orgA } = await seed();
    await rejects(db.organization.delete({ where: { id: orgA.id } })).rejects.toThrow();
    await rejects(db.project.delete({ where: { projectId: '1001' } })).rejects.toThrow();
    expect(await db.deploy.count()).toBe(1);
  });

  test('a Project Organization is immutable while linked to a Deployment', async () => {
    const { orgB } = await seed();
    await rejects(
      db.project.update({ where: { projectId: '1001' }, data: { orgId: orgB.id } }),
    ).rejects.toThrow(/immutable while linked/);
    expect(await db.project.findUniqueOrThrow({ where: { projectId: '1001' } })).toMatchObject({
      projectId: '1001',
    });
  });

  test('the database rejects a duplicate Project, SHA and Environment tuple', async () => {
    await seed();
    await rejects(
      db.deploy.create({
        data: {
          projectId: '1001',
          deploymentId: SHA,
          environment: 'production',
          title: 'duplicate',
          dateStarted: new Date(),
        },
      }),
    ).rejects.toHaveProperty('code', 'P2002');
    // The same SHA in another Environment is a different Deployment.
    await db.deploy.create({
      data: {
        projectId: '1001',
        deploymentId: SHA,
        environment: 'staging',
        title: 'other-environment',
        dateStarted: new Date(),
      },
    });
    expect(await db.deploy.count()).toBe(2);
  });

  test('the Deploy URL CHECK accepts https and rejects other schemes', async () => {
    await seed();
    const insert = (url: string, sha: string) =>
      db.deploy.create({
        data: {
          projectId: '1001',
          deploymentId: sha,
          environment: 'production',
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

  test('writes one audit entry per Deployment with the SHA in its payload', async () => {
    await seed();
    const deployRepo = new DeployRepo(db, audit);
    await deployRepo.append({
      projectId: '1001',
      environment: 'staging',
      deploymentId: 'f'.repeat(40),
      title: 'deploy-2',
      dateStarted: new Date(),
      actor: 'test-client',
    });
    const entries = await db.auditEntry.findMany({ orderBy: { seq: 'asc' } });
    expect(entries.map((entry) => [entry.projectId, entry.type])).toEqual([
      ['1001', 'deploy.created'],
    ]);
    const created = entries[0];
    expect(created?.payload).toMatchObject({
      deploymentId: 'f'.repeat(40),
      projectId: '1001',
      title: 'deploy-2',
      environment: 'staging',
    });
  });

  test('redacts Environment and title in the deploy.created audit payload', async () => {
    await seed();
    const deployRepo = new DeployRepo(db, audit);
    await deployRepo.append({
      projectId: '1001',
      environment: 'Authorization: Bearer abcdef123456',
      deploymentId: 'f'.repeat(40),
      title: 'Authorization: Bearer fedcba987654',
      dateStarted: new Date(),
      actor: 'test-client',
    });
    const entry = await db.auditEntry.findFirstOrThrow({
      where: { projectId: '1001', type: 'deploy.created' },
    });
    expect(JSON.stringify(entry.payload)).not.toContain('abcdef123456');
    expect(JSON.stringify(entry.payload)).not.toContain('fedcba987654');
    const stored = await db.deploy.findFirstOrThrow({
      where: { projectId: '1001', deploymentId: 'f'.repeat(40) },
    });
    expect(stored.environment).toBe('Authorization: Bearer abcdef123456');
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

  test('an audit append failure rolls back the deploy write', async () => {
    await seed();
    const failing = {
      appendInTransaction: async () => {
        throw new Error('audit unavailable');
      },
    } as unknown as AuditRepo;
    await expect(
      new DeployRepo(db, failing).append({
        projectId: '1001',
        environment: 'staging',
        deploymentId: 'f'.repeat(40),
        title: 'deploy-2',
        dateStarted: new Date(),
        actor: 'test-client',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(await db.deploy.count()).toBe(1);
  });
});
