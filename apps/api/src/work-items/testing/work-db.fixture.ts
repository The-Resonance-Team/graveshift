import { AgentConfigSchema } from '@graveshift/agents';
import type { WorkCaller, WorkSnapshot } from '@graveshift/work';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { openTestDatabase, resetDatabase, workItemData } from '../../../test/database/fixtures';
import { AuditRepo } from '../../audit/audit.repo';
import type { PrismaService } from '../../infra/prisma.service';
import { WorkItemRepo } from '../work-item.repo';
import { testProjectGrant } from '../../internal/testing/project-grant.fixture';

export const WORK_TEST_AGENTS = [false, true].map((autoFix) =>
  AgentConfigSchema.parse({
    name: autoFix ? 'automatic' : 'fixture',
    slug: autoFix ? 'automatic' : 'fixture',
    role: 'fix',
    description: 'Prepare an Exorcism',
    prompt: 'Resolve {{INCIDENT}}',
    params: [{ INCIDENT: '' }],
    provider: '@ai-sdk/openai',
    model: 'test-model',
    baseUrl: 'https://model.example.test',
    apiKeyEnv: 'GRAVESHIFT_MODEL_KEY',
    allowedTools: [],
    dailyBudgetUsd: 1,
    autoFix,
  }),
);

export function workCaller(commandId = 'command-1'): WorkCaller {
  return { projectId: 'project-1', actor: 'fixture', commandId };
}

export function attemptFence(snapshot: WorkSnapshot) {
  const attempt = snapshot.activeAttempt;
  if (!attempt) throw new Error('Expected an active Fix attempt');
  return {
    expectedVersion: snapshot.version,
    attemptId: attempt.id,
    attemptVersion: attempt.version,
  };
}

export function setupWorkDatabase() {
  let db: PrismaService;
  let audit: AuditRepo;
  let repo: WorkItemRepo;
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    repo = new WorkItemRepo(db, audit, WORK_TEST_AGENTS, testProjectGrant(['project-1']));
  });
  beforeEach(async () => {
    await resetDatabase(db);
    await db.workItem.create({ data: { ...workItemData(), fixPriority: 100 } });
  });
  afterAll(async () => db?.onModuleDestroy());
  return {
    get db() {
      return db;
    },
    get repo() {
      return repo;
    },
    get audit() {
      return audit;
    },
    async seed(overrides: Partial<Prisma.WorkItemCreateInput>) {
      return db.workItem.create({ data: { ...workItemData(), ...overrides } });
    },
    async read() {
      return repo.read({ projectId: 'project-1', id: 'work-1' });
    },
    async claim(caller = workCaller()) {
      return repo.claim({
        caller: caller,
        id: 'work-1',
        input: {
          expectedVersion: (await repo.read({ projectId: caller.projectId, id: 'work-1' })).version,
          command: { kind: 'fix_now', body: {} },
        },
      });
    },
    async question() {
      await this.claim();
      const snapshot = await this.read();
      const fence = attemptFence(snapshot);
      return repo.saveQuestion({
        caller: workCaller(),
        id: 'work-1',
        input: {
          ...fence,
          progress: {
            version: 1,
            phase: 'awaiting_answer',
            attemptId: fence.attemptId,
            selectedAgent: { name: 'fixture', slug: 'fixture' },
            text: 'Verified incident',
            params: {},
            missing: ['INCIDENT'],
            question: 'What incident must the Agent resolve?',
          },
        },
      });
    },
  };
}
