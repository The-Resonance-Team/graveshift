import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { PrismaCredentialRepo } from '../../src/auth/repo/credential.repo';
import { DeployRepo } from '../../src/deploys/deploy.repo';
import { DEFAULT_DAEMON_GRANT } from '../../src/identity/identity.types';
import { PrismaIdentityRepo } from '../../src/identity/repo/identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { testOAuthClients } from '../fakes/auth-test-config';
import { openTestDatabase, resetDatabase } from './fixtures';

export interface AuthFixture {
  readonly db: PrismaService;
  readonly audit: AuditRepo;
  readonly repo: PrismaCredentialRepo;
  readonly identity: PrismaIdentityRepo;
  readonly deploys: DeployRepo;
}

/** The Production Project ids the OAuth test clients and the daemon grant use. */
const CLIENT_PROJECT_IDS = ['12345', '12346'] as const;

/** Build the one real identity store every API test suite reads through. */
export async function seedAuthIdentity(db: PrismaService): Promise<PrismaIdentityRepo> {
  const identity = new PrismaIdentityRepo(db);
  await db.organization.upsert({
    where: { id: 'test-org' },
    create: { id: 'test-org', name: 'Test', slug: 'test-org' },
    update: {},
  });
  await Promise.all(
    CLIENT_PROJECT_IDS.map((projectId) =>
      db.project.upsert({
        where: { projectId },
        create: {
          projectId,
          orgId: 'test-org',
          name: `Project ${projectId}`,
          slug: `project-${projectId}`,
        },
        update: {},
      }),
    ),
  );
  await Promise.all(testOAuthClients().map((client) => identity.addOAuthClient(client)));
  await identity.addGrant({
    id: randomUUID(),
    name: DEFAULT_DAEMON_GRANT,
    projectIds: [...CLIENT_PROJECT_IDS],
  });
  return identity;
}

/** One isolated database per suite; the app and its repos share that client. */
export function setupAuthDatabase(): AuthFixture {
  let db: PrismaService;
  let audit: AuditRepo;
  let repo: PrismaCredentialRepo;
  let identity: PrismaIdentityRepo;
  let deploys: DeployRepo;
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    repo = new PrismaCredentialRepo(db, audit);
    identity = new PrismaIdentityRepo(db);
    deploys = new DeployRepo(db, audit);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    identity = await seedAuthIdentity(db);
  });
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
    get identity() {
      return identity;
    },
    get deploys() {
      return deploys;
    },
  };
}
