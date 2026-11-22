import { ConfigService } from '@nestjs/config';
import { createSubtasks } from '@graveshift/core';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../src/infra/prisma.service';
import { assertTestDatabase } from './guard';

export const FIXTURE_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const FIXTURE_AT = '2026-11-21T07:00:00.000+07:00';
export const dbTestEnabled = process.env.GRAVESHIFT_DB_TEST === '1' && !process.env.CI;
const ownedClients = new WeakSet<PrismaService>();

export const OWNED_MODELS = [
  {
    key: 'auditEntry',
    table: 'audit_entries',
    count: (db: PrismaService) => db.auditEntry.count(),
  },
  {
    key: 'actionClaim',
    table: 'action_claims',
    count: (db: PrismaService) => db.actionClaim.count(),
  },
  { key: 'fixAttempt', table: 'fix_attempts', count: (db: PrismaService) => db.fixAttempt.count() },
  {
    key: 'workCommand',
    table: 'work_commands',
    count: (db: PrismaService) => db.workCommand.count(),
  },
  { key: 'credential', table: 'credentials', count: (db: PrismaService) => db.credential.count() },
  { key: 'haunting', table: 'hauntings', count: (db: PrismaService) => db.haunting.count() },
  { key: 'workItem', table: 'work_items', count: (db: PrismaService) => db.workItem.count() },
  { key: 'release', table: 'releases', count: (db: PrismaService) => db.release.count() },
  {
    key: 'projectRelease',
    table: 'project_releases',
    count: (db: PrismaService) => db.projectRelease.count(),
  },
  {
    key: 'environment',
    table: 'environments',
    count: (db: PrismaService) => db.environment.count(),
  },
  { key: 'deploy', table: 'deploys', count: (db: PrismaService) => db.deploy.count() },
  {
    key: 'deployProject',
    table: 'deploy_projects',
    count: (db: PrismaService) => db.deployProject.count(),
  },
] as const satisfies readonly {
  key: keyof PrismaService;
  table: string;
  count: (db: PrismaService) => Promise<number>;
}[];

export function testDatabaseUrl(): string {
  return assertTestDatabase({
    url: process.env.DATABASE_URL,
    runId: process.env.GRAVESHIFT_DB_TEST_ID,
    optIn: process.env.GRAVESHIFT_DB_TEST,
    ci: process.env.CI,
  });
}

export async function openTestDatabase(): Promise<PrismaService> {
  const db = new PrismaService(new ConfigService({ DATABASE_URL: testDatabaseUrl() }));
  try {
    await db.$connect();
    ownedClients.add(db);
    return db;
  } catch (error) {
    await db.onModuleDestroy();
    throw error;
  }
}

export async function resetDatabase(db: PrismaService): Promise<void> {
  testDatabaseUrl();
  if (!ownedClients.has(db))
    throw new Error('Refusing to reset a client outside the local fixture.');
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${OWNED_MODELS.map((model) => `"${model.table}"`).join(', ')} RESTART IDENTITY`,
  );
}

export async function modelCounts(db: PrismaService): Promise<Record<string, number>> {
  const counts = await Promise.all(
    OWNED_MODELS.map(async (model) => [model.key, await model.count(db)]),
  );
  return Object.fromEntries(counts);
}

export function workItemData(projectId = 'project-1', id = 'work-1') {
  return {
    id,
    projectId,
    title: 'Fixture work',
    description: '',
    successCriteria: ['The fixture completes'],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'medium',
    assignee: 'needs_agent_fixture',
    reporter: 'fixture',
    labels: [],
    team: 'fixture',
    watchers: [],
    severity: 'warning',
    service: 'fixture',
    diagnosisRef: 'diagnosis-1',
    fixPriority: 0,
  } satisfies Prisma.WorkItemCreateInput;
}
