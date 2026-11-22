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

import type { WorkListQuery } from '../../src/work-items/work-item.types';

export const TEST_AGENTS = [
  { name: 'SRE Agent', autoFix: false },
  { name: 'Automatic Agent', autoFix: true },
];

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

/** Explicit HTTP test adapter. No production store or fix execution is replaced. */
export function fakeWorkApi(options: { deny?: boolean; fail?: boolean; projectId?: string } = {}) {
  const allowedProjectId = options.projectId ?? '12345';
  const items = new Map([
    ['work-1', workItem()],
    ['human', workItem('human', { assignee: 'needs_human' })],
    ['done', workItem('done', { status: 'done' })],
  ]);
  const calls: { method: string; caller: WorkCaller; id: string; input: unknown }[] = [];
  const receipts = new Map<string, { content: string; result: FixResult }>();
  const read = (projectId: string, id: string) => {
    if (projectId !== allowedProjectId) throw new WorkError('PROJECT_FORBIDDEN', 'Wrong project');
    const item = items.get(id);
    if (!item) throw new WorkError('WORK_NOT_FOUND', 'The Work item does not exist');
    return item;
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
    const current = read(caller.projectId, id);
    assertFixEligible(current, trigger, TEST_AGENTS);
    const item = trigger === 'fix_now' ? { ...current, fixPriority: 0 } : current;
    items.set(id, item);
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
      item: pr === null ? item : { ...item, draftPr: pr },
      trigger,
      effect: pr === null ? 'deny' : 'allow',
      ok: pr !== null,
      pr,
      reason: options.fail ? 'fix_failed' : options.deny ? 'low_confidence' : null,
      failure: options.fail ? 'fix_error' : options.deny ? 'policy_denied' : 'none',
      routing: null,
      attemptId: `attempt-${id}`,
    };
    items.set(id, result.item);
    receipts.set(key, { content, result });
    return result;
  };
  const commands: WorkCommands = {
    async triage(caller, id, input) {
      calls.push({ method: 'triage', caller, id, input });
      const decision = decideTriage(read(caller.projectId, id), input.assignee, TEST_AGENTS);
      items.set(id, decision.item);
      if (decision.trigger === null) return { item: decision.item, autoFix: null };
      return triageResult(await run(caller, id, input, 'auto_fix'));
    },
    async fixNow(caller, id, input) {
      calls.push({ method: 'fixNow', caller, id, input });
      return run(caller, id, input, 'fix_now');
    },
    async answer(caller, id, input) {
      calls.push({ method: 'answer', caller, id, input });
      read(caller.projectId, id);
      throw new WorkError('QUESTION_NOT_PENDING', 'This question is no longer pending');
    },
  };
  const repo = {
    async read(ref: { projectId: string; id: string }) {
      return { item: read(ref.projectId, ref.id), version: 0 };
    },
    async list(projectId: string, query: WorkListQuery) {
      read(projectId, 'work-1');
      const { offset, limit, ...filters } = query;
      const rows = [...items.values()]
        .filter((item) =>
          Object.entries(filters).every(([key, value]) => item[key as keyof WorkItem] === value),
        )
        .sort(
          (left, right) =>
            left.fixPriority - right.fixPriority ||
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id),
        );
      return { items: rows.slice(offset, offset + limit), total: rows.length, offset, limit };
    },
  };
  return { repo, commands, calls };
}
