// Offline e2e for the real fix path: real gateway, real GitHub App client, two
// stateful emulators. No real key, model call, GitHub call or network is used.
import { createSubtasks, NEEDS_HUMAN, type WorkItem } from '@graveshift/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { createFixDeps } from '../src/fix/fix.deps';
import { FIX_DEPS, type FixDeps } from '../src/fix/fix.types';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from '../src/work-items/work-item.policy';
import { WORK_ITEM_SEED, WorkItemStore } from '../src/work-items/work-item.store';
import { useFixEmulators, rewriteHost } from './fix-emulator.setup';

const emu = useFixEmulators();

const item: WorkItem = {
  id: 'wi-e2e',
  title: 'Fix OOM on api',
  description: 'A Grave was drained by a leech.',
  successCriteria: [],
  subtasks: createSubtasks([]),
  status: 'todo',
  priority: 'high',
  assignee: NEEDS_HUMAN,
  reporter: 'wraith',
  startDate: null,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: [],
  team: 'sre',
  watchers: [],
  severity: 'critical',
  service: 'api',
  diagnosisRef: 'diag-e2e',
  fixPriority: 100,
  draftPr: null,
};

const POLICY: WorkItemPolicy = {
  agentNames: ['Exorcist'],
  clientConfig: {},
  autoFixEnabled: true,
};

async function buildApp(deps: FixDeps): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WORK_ITEM_SEED)
    .useValue([])
    .overrideProvider(WorkItemStore)
    .useValue({
      list: () => [item],
      get: (id: string) => (id === item.id ? item : undefined),
      save: () => {},
    })
    .overrideProvider(WORK_ITEM_POLICY)
    .useValue(POLICY)
    .overrideProvider(FIX_DEPS)
    .useValue(deps)
    .compile();
  return configureApp(moduleRef.createNestApplication({ logger: false }));
}

async function realDeps(): Promise<FixDeps> {
  const { loadGraveshiftConfig } = await import('@graveshift/config');
  const config = await loadGraveshiftConfig();
  const urls = emu.urls();
  const deps = createFixDeps(config, {
    env: {
      ANTHROPIC_API_KEY: 'test-only-key',
      GRAVESHIFT_GITHUB_APP_ID: '12345',
      GRAVESHIFT_GITHUB_PRIVATE_KEY: emu.appPrivateKey(),
    },
    githubFetch: rewriteHost(urls.github),
    aiFetch: rewriteHost(urls.ai),
  });
  // The daemon read is deferred to #59. Only this collaborator is a fake.
  return {
    ...deps,
    context: {
      load: async () => ({
        ok: true as const,
        value: {
          confidence: 0.95,
          category: 'code_bug',
          signals: ['oom_killed'],
          counters: {
            openPrsLastHour: 0,
            actionsLast10Min: 0,
            diagnosisLoops: 0,
            llmSpentTodayUsd: 0,
          },
        },
      }),
    },
  };
}

describe('fix path over emulated GitHub and AI', () => {
  test('Fix now opens one draft PR through the real collaborators', async () => {
    const app = await buildApp(await realDeps());
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-e2e/fix-now')
      .expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.failure).toBe('none');
    expect(response.body.pr.number).toBeGreaterThan(0);
    expect(response.body.pr.branch).toContain('graveshift/');

    const urls = emu.urls();
    const pulls = await fetch(`${urls.github}/repos/xiro/haunted-candy-shop/pulls`).then((res) =>
      res.json(),
    );
    expect(Array.isArray(pulls)).toBe(true);
    expect((pulls as unknown[]).length).toBe(1);
    const calls = await fetch(`${urls.ai}/_ai/calls`).then((res) => res.json());
    expect(Array.isArray(calls)).toBe(true);
    expect((calls as unknown[]).length).toBeGreaterThan(0);

    await app.close();
  });
});
