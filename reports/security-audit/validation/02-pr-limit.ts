// Bounded, offline reproduction of
// apps/api/src/work-items/work-item.publication.ts:beginPublication/project-pr-limit.
// Imports the REAL beginPublication and drives it with an in-memory fake Prisma tx.
import { beginPublication } from '/target/apps/api/src/work-items/work-item.publication.ts';

const PROJECT_ID = 'project-1';
const MAX_OPEN_PRS_PER_HOUR = 1;
const BASE_SHA = 'base-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-11-26T12:00:00.000Z');
const LEASE_UNTIL = new Date('2026-11-26T13:00:00.000Z');

type Row = Record<string, unknown>;

function workItemRow(id: string): Row {
  return {
    id,
    projectId: PROJECT_ID,
    title: `Work item ${id}`,
    description: '',
    successCriteria: [],
    subtasks: { items: [], completed: 0 },
    status: 'todo',
    priority: 'medium',
    assignee: 'needs_human',
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
    diagnosisRef: 'diag-1',
    fixPriority: 100,
    draftPr: null,
    activeAttemptId: `attempt-${id}`,
    version: 0,
    diagnosis: null,
  };
}

function attemptRow(id: string): Row {
  return {
    id: `attempt-${id}`,
    projectId: PROJECT_ID,
    commandId: `command-${id}`,
    workerId: 'worker-1',
    leaseUntil: LEASE_UNTIL,
    workItemId: id,
    agent: 'fixture',
    trigger: 'fix_now',
    state: 'running',
    routingProgress: null,
    params: {},
    questionId: null,
    result: null,
    publication: null,
    baseSha: null,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function commandRow(id: string): Row {
  return {
    projectId: PROJECT_ID,
    commandId: `command-${id}`,
    workItemId: id,
    actor: 'fixture',
    kind: 'fix',
    requestHash: `hash-${id}`,
    attemptId: `attempt-${id}`,
    workVersion: 0,
    result: null,
  };
}

function applyUpdate(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'version' && value && typeof value === 'object' && 'increment' in value) {
      row.version = (row.version as number) + ((value as { increment: number }).increment ?? 0);
    } else {
      row[key] = value;
    }
  }
  row.updatedAt = new Date(NOW);
}

const state = {
  workItems: new Map<string, Row>([
    ['work-1', workItemRow('work-1')],
    ['work-2', workItemRow('work-2')],
  ]),
  attempts: new Map<string, Row>([
    ['attempt-work-1', attemptRow('work-1')],
    ['attempt-work-2', attemptRow('work-2')],
  ]),
  commands: new Map<string, Row>([
    ['command-work-1', commandRow('work-1')],
    ['command-work-2', commandRow('work-2')],
  ]),
};

// Minimal fake faithfully implementing every tx method referenced by
// loadWork / activeAttempt / requireCommand / requireLiveLease / fenceWork / fenceAttempt.
const tx = {
  workItem: {
    findFirst: async ({ where }: { where: Row }) => state.workItems.get(where.id as string) ?? null,
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const row = state.workItems.get(where.id as string);
      if (
        !row ||
        row.version !== where.version ||
        row.status !== where.status ||
        row.activeAttemptId !== where.activeAttemptId
      ) {
        return { count: 0 };
      }
      applyUpdate(row, data);
      return { count: 1 };
    },
  },
  fixAttempt: {
    findFirst: async ({ where }: { where: Row }) => {
      const row = state.attempts.get(where.id as string);
      if (
        !row ||
        row.projectId !== where.projectId ||
        row.workItemId !== where.workItemId
      ) {
        return null;
      }
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const row = state.attempts.get(where.id as string);
      if (
        !row ||
        row.version !== where.version ||
        row.state !== where.state ||
        row.workerId !== where.workerId
      ) {
        return { count: 0 };
      }
      const condition = (where.AND as Row[] | undefined)?.[0];
      const after = condition?.leaseUntil as { gt?: Date } | undefined;
      if (after?.gt && !(new Date(row.leaseUntil as Date) > new Date(after.gt))) {
        return { count: 0 };
      }
      applyUpdate(row, data);
      return { count: 1 };
    },
  },
  workCommand: {
    findUnique: async ({
      where,
    }: {
      where: { projectId_commandId: { projectId: string; commandId: string } };
    }) => state.commands.get(where.projectId_commandId.commandId) ?? null,
  },
  // databaseNow(tx) uses tx.$queryRaw as a tagged template.
  $queryRaw: (_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.resolve([{ at: NOW }]),
};

const auditEvents: unknown[] = [];
const audit = {
  appendInTx: async (_tx: unknown, _projectId: string, draft: unknown) => {
    auditEvents.push(draft);
  },
};

// Mirrors WorkItemRepo.publicationCount: count recorded publications in the last hour.
// Neither work item has a recorded draftPr, so this reads zero for both admissions.
const fakeWorkRepo = {
  publicationCount: async (_projectId: string) =>
    [...state.workItems.values()].filter((row) => row.draftPr !== null).length,
};

const source = await Bun.file('/target/apps/api/src/work-items/work-item.publication.ts').text();
const beginBody = source.split('\n').slice(21, 58).join('\n');
const limitTokensInBegin = ['publicationCount', 'maxOpenPrsPerHour', 'openPrsLastHour'].filter(
  (token) => beginBody.includes(token),
);

const results: Array<{ id: string; accepted: boolean; state?: string; publication?: unknown; error?: string }> = [];

for (const id of ['work-1', 'work-2']) {
  const countBefore = await fakeWorkRepo.publicationCount(PROJECT_ID);
  const caller = {
    projectId: PROJECT_ID,
    actor: 'fixture',
    commandId: `command-${id}`,
    expectedVersion: 0,
    workerId: 'worker-1',
  };
  const input = {
    expectedVersion: 0,
    attemptId: `attempt-${id}`,
    attemptVersion: 0,
    intent: {
      repo: 'acme/widgets',
      branch: `refs/heads/fixer-inc-${id}`,
      baseSha: BASE_SHA,
    },
  };
  try {
    const snapshot = await beginPublication(tx as never, audit as never, caller, id, input);
    results.push({
      id,
      accepted: true,
      state: snapshot.activeAttempt?.state,
      publication: snapshot.activeAttempt?.publication,
      publicationCountBefore: countBefore,
    });
  } catch (e) {
    results.push({
      id,
      accepted: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      publicationCountBefore: countBefore,
    });
  }
}

const bothAccepted = results.every((r) => r.accepted);
const countAfter = await fakeWorkRepo.publicationCount(PROJECT_ID);
const verdict =
  bothAccepted && limitTokensInBegin.length === 0 ? 'confirmed' : 'inconclusive';

console.log(
  JSON.stringify(
    {
      lead: 'apps/api/src/work-items/work-item.publication.ts:beginPublication/project-pr-limit',
      verdict,
      observed: {
        maxOpenPrsPerHour: MAX_OPEN_PRS_PER_HOUR,
        distinctWorkItems: 2,
        distinctAttempts: 2,
        publicationCountReadAtEachAdmission: results.map((r) => r.publicationCountBefore),
        publicationCountAfterBothAdmissions: countAfter,
        admissions: results,
        auditEvents: auditEvents.length,
        limitTokensReferencedInsideBeginPublication: limitTokensInBegin,
        sourceLines: [
          'apps/api/src/work-items/work-item.publication.ts:22-58 (beginPublication: no project-wide PR gate)',
          'apps/api/src/work-items/work-item.repo.ts:106-115 (publicationCount counts publications in the last hour)',
          'apps/api/src/internal/policy-context.service.ts:31-42 (openPrsLastHour from publicationCount)',
          'packages/policy/src/evaluation.ts:33-42 (rate_limited when openPrsLastHour >= maxOpenPrsPerHour)',
        ],
      },
      reason: bothAccepted
        ? `Both distinct work-item/attempt pairs were admitted by the real beginPublication (both snapshots show state 'publishing' with a saved publication intent), with maxOpenPrsPerHour=1 and publicationCount reading zero at each admission. beginPublication (work-item.publication.ts:22-58) performs only per-attempt fencing (loadWork, activeAttempt, requireCommand, requireLiveLease, fenceWork, fenceAttempt) and never consults publicationCount, maxOpenPrsPerHour, openPrsLastHour, or any project-wide reservation (limit tokens found inside function: ${JSON.stringify(limitTokensInBegin)}). No project-wide PR limit blocks the second publication intent.`
        : `Did not observe two accepted publications: ${JSON.stringify(results)}; limit tokens inside beginPublication: ${JSON.stringify(limitTokensInBegin)}.`,
    },
    null,
    2,
  ),
);
