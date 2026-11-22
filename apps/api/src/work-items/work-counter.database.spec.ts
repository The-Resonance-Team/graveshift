import { Prisma } from '@prisma/client';
import { describe, expect, spyOn, test } from 'bun:test';
import { subHours, subMinutes } from 'date-fns';

import { dbTestEnabled } from '../../test/database/fixtures';
import {
  attemptFence,
  setupWorkDatabase,
  WORK_TEST_AGENTS,
  workCaller,
} from './testing/work-db.fixture';
import { WorkItemRepo } from './work-item.repo';
import { testProjectGrant } from '../internal/testing/project-grant.fixture';

const intent = { repo: 'owner/repo', branch: 'graveshift/work-1', baseSha: 'base-sha' };
const pr = {
  repo: intent.repo,
  branch: intent.branch,
  headSha: 'head-sha',
  number: 7,
  url: 'https://github.test/owner/repo/pull/7',
};

describe.skipIf(!dbTestEnabled)('Postgres Work item publication counter', () => {
  const fixture = setupWorkDatabase();

  test('counts current project intents and known PRs across services and attempt states', async () => {
    const now = new Date();
    const recent = subMinutes(now, 30);
    const old = subHours(now, 2);
    await fixture.seed({ id: 'work-2', service: 'other-service' });
    await fixture.seed({ id: 'foreign-work', projectId: 'project-2' });
    const base = {
      projectId: 'project-1',
      workItemId: 'work-1',
      agent: 'fixture',
      trigger: 'fix_now' as const,
      params: {},
      createdAt: old,
      updatedAt: recent,
    };
    await fixture.db.fixAttempt.createMany({
      data: [
        { ...base, id: 'intent', commandId: 'intent', state: 'publishing', publication: intent },
        {
          ...base,
          id: 'uncertain',
          commandId: 'uncertain',
          state: 'uncertain',
          publication: intent,
        },
        { ...base, id: 'completed', commandId: 'completed', state: 'completed', publication: pr },
        {
          ...base,
          id: 'failed-with-pr',
          commandId: 'failed-with-pr',
          state: 'failed',
          publication: pr,
        },
        {
          ...base,
          id: 'other-service',
          commandId: 'other-service',
          workItemId: 'work-2',
          state: 'publishing',
          publication: intent,
        },
        {
          ...base,
          id: 'old-publication',
          commandId: 'old-publication',
          state: 'completed',
          publication: pr,
          updatedAt: old,
        },
        { ...base, id: 'no-publication', commandId: 'no-publication', state: 'claimed' },
        {
          ...base,
          id: 'json-null',
          commandId: 'json-null',
          state: 'failed',
          publication: Prisma.JsonNull,
        },
        {
          ...base,
          id: 'foreign',
          commandId: 'foreign',
          projectId: 'project-2',
          workItemId: 'foreign-work',
          state: 'publishing',
          publication: intent,
        },
      ],
    });
    expect(await fixture.repo.publicationCount('project-1')).toBe(5);
    const foreign = new WorkItemRepo(
      fixture.db,
      fixture.audit,
      WORK_TEST_AGENTS,
      testProjectGrant(['project-2']),
    );
    expect(await foreign.publicationCount('project-2')).toBe(1);
    await expect(fixture.repo.publicationCount('project-2')).rejects.toMatchObject({
      code: 'PROJECT_FORBIDDEN',
    });
  });

  test('counts a saved intent and retains the count when its confirmed PR audit handoff fails', async () => {
    expect(await fixture.repo.publicationCount('project-1')).toBe(0);
    await fixture.claim();
    expect(await fixture.repo.publicationCount('project-1')).toBe(0);
    await fixture.repo.beginPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
    expect(await fixture.repo.publicationCount('project-1')).toBe(1);
    const append = spyOn(fixture.audit, 'append').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.recordPublication({
          caller: workCaller(),
          id: 'work-1',
          input: {
            ...attemptFence(await fixture.read()),
            pr,
            baseSha: intent.baseSha,
          },
        }),
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect((await fixture.read()).item.draftPr).toEqual(pr);
    expect(await fixture.repo.publicationCount('project-1')).toBe(1);
  });
});
