import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/repo/audit.repo';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

const SHA = 'a'.repeat(40);

describe.skipIf(!dbTestEnabled)('Deployment closure is Environment-scoped', () => {
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

  test('closeFirst touches only the SHA in the named Environment', async () => {
    const org = await db.organization.create({ data: { name: 'Alpha', slug: 'alpha' } });
    await db.project.create({
      data: { projectId: '1001', orgId: org.id, name: 'First', slug: 'first' },
    });
    const production = await db.environment.create({ data: { orgId: org.id, name: 'production' } });
    const staging = await db.environment.create({ data: { orgId: org.id, name: 'staging' } });
    const data = {
      orgId: org.id,
      projectId: '1001',
      deploymentId: SHA,
      title: 'deploy',
      dateStarted: new Date(),
    };
    await db.deploy.create({ data: { ...data, environmentId: production.id } });
    await db.deploy.create({ data: { ...data, environmentId: staging.id } });
    const repo = new DeployRepo(db, audit);
    expect(await repo.closeFirst('1001', SHA, 'production')).toBe(true);
    expect(await repo.listClosed('1001')).toEqual([
      { deploymentId: SHA, environment: 'production' },
    ]);
    const open = await db.deploy.findMany({
      where: { projectId: '1001', deploymentId: SHA, closedAt: null },
      include: { environment: true },
    });
    expect(open.map((row) => row.environment.name)).toEqual(['staging']);
  });
});
