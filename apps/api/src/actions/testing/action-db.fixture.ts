import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { openTestDatabase, resetDatabase } from '../../../test/database/fixtures';
import { AuditRepo } from '../../audit/audit.repo';
import type { PrismaService } from '../../infra/prisma.service';
import { ActionRepo } from '../action.repo';
import { ACTION_TEST_POLICY, claimInput } from './action.fixture';

export function actionRepo(db: PrismaService, projectId = 'project-1') {
  return new ActionRepo(db, new AuditRepo(db), { projectId, policy: ACTION_TEST_POLICY });
}

export function setupActionsDatabase() {
  let db: PrismaService;
  let audit: AuditRepo;
  let repo: ActionRepo;
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    repo = new ActionRepo(db, audit, { projectId: 'project-1', policy: ACTION_TEST_POLICY });
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db?.onModuleDestroy());
  return {
    get db() {
      return db;
    },
    get audit() {
      return audit;
    },
    get repo() {
      return repo;
    },
    async input(tokenId = 'token-1', service = 'api', actionId = `action-${tokenId}`) {
      const [clock] = await db.$queryRaw<Array<{ at: Date }>>`SELECT clock_timestamp() AS at`;
      if (!clock) throw new Error('Database clock is missing');
      return claimInput(clock.at.getTime(), tokenId, service, actionId);
    },
  };
}
