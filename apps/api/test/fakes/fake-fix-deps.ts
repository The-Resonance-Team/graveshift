import { createSubtasks, type WorkItem } from '@graveshift/core';
import {
  WorkError,
  assertFixEligible,
  decideTriage,
  triageResult,
  type FixResult,
  type WorkCaller,
  type WorkCommands,
} from '@graveshift/work';
import type { Prisma } from '@prisma/client';

import { AuditRepo } from '../../src/audit/audit.repo';
import { testProjectGrant } from '../../src/internal/testing/project-grant.fixture';
import type { PrismaService } from '../../src/infra/prisma.service';
import { WorkItemRepo } from '../../src/work-items/work-item.repo';
import { workItemData } from '../database/fixtures';

export const TEST_AGENTS = [
  { name: 'SRE Agent', autoFix: false },
  { name: 'Automatic Agent', autoFix: true },
];

/** Work ids are global in Postgres. Only the first seeded Project keeps the short ids. */
export function workId(projectId: string, id = 'work-1', primary = '12345'): string {
  return projectId === primary ? id : `${projectId}-${id}`;
}

export function workItem(id = 'work-1', overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    title: `Work item ${id}`,
    description: 'Verified incident',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'medium',
    assignee: 'needs_agent_SRE Agent',
    reporter: 'wraith',
    startDate: null,
    dueDate: null,
    sprint: null,
    parent: null,
    labels: [],
    team: 'sre',
    watchers: [],
    severity: 'warning',
    service: 'api',
    diagnosisRef: 'diagnosis-1',
    fixPriority: 100,
    draftPr: null,
    ...overrides,
  };
}

/** Explicit HTTP test adapter. The Work store is the real repository over the test database. */
export function fakeWorkApi(
  db: PrismaService,
  audit: AuditRepo,
  options: {
    deny?: boolean;
    fail?: boolean;
    projectId?: string;
    projectIds?: string[];
    /** Keeps the fake daemon inside a call, so concurrent requests really overlap. */
    delayMs?: (caller: WorkCaller) => number;
  } = {},
) {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const hold = (caller: WorkCaller) => sleep(options.delayMs?.(caller) ?? 0);
  const projects = [options.projectId ?? '12345', ...(options.projectIds ?? [])];
  const allowed = new Set(projects);
  // One durable row set per Project: a client's change is read by every later client, and a
  // Project outside the grant cannot see another Project's Work.
  // Work ids are globally unique in Postgres, so a second Project gets namespaced ids.
  const seeded = Promise.all(
    projects.map((projectId) =>
      db.workItem.createMany({
        data: [
          {
            ...workItemData(projectId, workId(projectId, 'work-1', projects[0])),
            assignee: 'needs_agent_SRE Agent',
          },
          {
            ...workItemData(projectId, workId(projectId, 'human', projects[0])),
            assignee: 'needs_human',
          },
          { ...workItemData(projectId, workId(projectId, 'done', projects[0])), status: 'done' },
        ],
        skipDuplicates: true,
      }),
    ),
  );
  const repo = new WorkItemRepo(db, audit, [], testProjectGrant(projects));
  const calls: { method: string; caller: WorkCaller; id: string; input: unknown }[] = [];
  /** Start and done markers per daemon call, so a test can prove overlap, not timing luck. */
  const timeline: string[] = [];
  const receipts = new Map<string, { content: string; result: FixResult }>();
  const read = async (projectId: string, id: string): Promise<WorkItem> => {
    if (!allowed.has(projectId)) throw new WorkError('PROJECT_FORBIDDEN', 'Wrong project');
    await seeded;
    return (await repo.read({ projectId, id })).item;
  };
  const store = async (projectId: string, id: string, changes: Prisma.WorkItemUpdateInput) => {
    await db.workItem.update({ where: { projectId_id: { projectId, id } }, data: changes });
  };
  const run = async (
    caller: WorkCaller,
    id: string,
    input: unknown,
    trigger: 'auto_fix' | 'fix_now',
  ) => {
    const key = `${caller.projectId}:${caller.commandId}`;
    const content = JSON.stringify({ id, input, trigger });
    const saved = receipts.get(key);
    if (saved) {
      if (saved.content !== content) throw new WorkError('COMMAND_CONFLICT', 'Different content');
      return saved.result;
    }
    const current = await read(caller.projectId, id);
    assertFixEligible(current, trigger, TEST_AGENTS);
    if (trigger === 'fix_now') await store(caller.projectId, id, { fixPriority: 0 });
    const pr =
      options.deny || options.fail
        ? null
        : {
            repo: 'owner/repo',
            number: 7,
            url: 'https://github.test/owner/repo/pull/7',
            branch: 'graveshift/work-1',
            headSha: 'head-sha',
          };
    const result: FixResult = {
      item: pr === null ? current : { ...current, draftPr: pr },
      trigger,
      effect: pr === null ? 'deny' : 'allow',
      ok: pr !== null,
      pr,
      reason: options.fail ? 'fix_failed' : options.deny ? 'low_confidence' : null,
      failure: options.fail ? 'fix_error' : options.deny ? 'policy_denied' : 'none',
      routing: null,
      attemptId: `attempt-${id}`,
    };
    if (pr !== null) {
      // Prisma Json boundary: the recorded policy result is already plain JSON data.
      await store(caller.projectId, id, { draftPr: pr as Prisma.InputJsonValue });
    }
    receipts.set(key, { content, result });
    return result;
  };
  const commands: WorkCommands = {
    async triage(caller, id, input) {
      calls.push({ method: 'triage', caller, id, input });
      timeline.push(`triage:${caller.projectId}:start`);
      await hold(caller);
      const decision = decideTriage(await read(caller.projectId, id), input.assignee, TEST_AGENTS);
      await store(caller.projectId, id, { assignee: decision.item.assignee });
      if (decision.trigger === null) {
        timeline.push(`triage:${caller.projectId}:done`);
        return { item: decision.item, autoFix: null };
      }
      const outcome = await triageResult(await run(caller, id, input, 'auto_fix'));
      timeline.push(`triage:${caller.projectId}:done`);
      return outcome;
    },
    async fixNow(caller, id, input) {
      calls.push({ method: 'fixNow', caller, id, input });
      timeline.push(`fixNow:${caller.projectId}:start`);
      await hold(caller);
      const result = await run(caller, id, input, 'fix_now');
      timeline.push(`fixNow:${caller.projectId}:done`);
      return result;
    },
    async answer(caller, id, input) {
      calls.push({ method: 'answer', caller, id, input });
      timeline.push(`answer:${caller.projectId}:start`);
      await hold(caller);
      await read(caller.projectId, id);
      timeline.push(`answer:${caller.projectId}:done`);
      throw new WorkError('QUESTION_NOT_PENDING', 'This question is no longer pending');
    },
  };
  return { repo, commands, calls, timeline };
}
