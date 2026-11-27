import { beforeAll, beforeEach, afterAll, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { testProjectGrant } from '../../src/internal/testing/project-grant.fixture';
import { WorkItemRepo } from '../../src/work-items/work-item.repo';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';
import { fakeWorkApi } from '../fakes/fake-fix-deps';
import type { PrismaService } from '../../src/infra/prisma.service';

const caller = { projectId: '12345', actor: 'client-1', commandId: 'fix-command-1' };

describe.skipIf(!dbTestEnabled)('fake Work dependencies over the real store', () => {
  let db: PrismaService;
  let audit: AuditRepo;

  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('the adapter reads through a real WorkItemRepo, not a per-project Map', async () => {
    const adapter = fakeWorkApi(db, audit, { projectId: '12345' });
    expect(adapter.repo).toBeInstanceOf(WorkItemRepo);
    expect((await adapter.repo.read({ projectId: '12345', id: 'work-1' })).item.id).toBe('work-1');

    await adapter.commands.fixNow(caller, 'work-1', {});
    const fresh = new WorkItemRepo(db, audit, [], testProjectGrant(['12345']));
    expect((await fresh.read({ projectId: '12345', id: 'work-1' })).item.fixPriority).toBe(0);
  });

  test('a second project cannot read the first project Work items', async () => {
    const adapter = fakeWorkApi(db, audit, { projectId: '12345' });
    await expect(
      adapter.commands.fixNow({ ...caller, projectId: '99999' }, 'work-1', {}),
    ).rejects.toHaveProperty('code', 'PROJECT_FORBIDDEN');
  });
});
