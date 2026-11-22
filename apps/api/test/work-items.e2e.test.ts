import { createSubtasks, NEEDS_HUMAN, type WorkItem } from '@graveshift/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import type { FixDeps } from '../src/fix/fix.types';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from '../src/work-items/work-item.policy';
import { WORK_ITEM_SEED, WorkItemStore } from '../src/work-items/work-item.store';
import { fakeFixDeps, FIX_DEPS, fixCalls } from './fakes/fake-fix-deps';

const AGENT_ASSIGNEE = 'needs_agent_SRE Bot';

const POLICY: WorkItemPolicy = {
  agentNames: ['SRE Bot'],
  clientConfig: {},
  autoFixEnabled: true,
};

interface StoreLike {
  list(): WorkItem[];
  get(id: string): WorkItem | undefined;
  save(item: WorkItem): void;
}

function fakeStore(seed: WorkItem[]): StoreLike {
  const map = new Map(seed.map((seedItem) => [seedItem.id, seedItem]));
  return {
    list: () => [...map.values()],
    get: (id) => map.get(id),
    save: (next) => {
      map.set(next.id, next);
    },
  };
}

function item(id: string, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    title: `Work item ${id}`,
    description: '',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'medium',
    assignee: NEEDS_HUMAN,
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
    diagnosisRef: `diag-${id}`,
    fixPriority: 100,
    draftPr: null,
    ...overrides,
  };
}

// The tests bring their own store, policy and fix deps. No agent YAML or demo seed is read.
async function buildApp(deps: FixDeps = fakeFixDeps()): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WORK_ITEM_SEED)
    .useValue([])
    .overrideProvider(WorkItemStore)
    .useValue(
      fakeStore([
        item('wi-1', {
          title: 'Fix OOM on api',
          subtasks: createSubtasks([
            { id: 'st-1', title: 'Read the diagnosis', done: true },
            { id: 'st-2', title: 'Propose a fix', done: false },
          ]),
        }),
        item('wi-2', { assignee: 'needs_agent_DevOps Bot' }),
        item('wi-3', { status: 'done' }),
      ]),
    )
    .overrideProvider(WORK_ITEM_POLICY)
    .useValue(POLICY)
    .overrideProvider(FIX_DEPS)
    .useValue(deps)
    .compile();
  return configureApp(moduleRef.createNestApplication({ logger: false }));
}

describe('work items API (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await buildApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('GET /api/work-items returns a page for the table', async () => {
    const response = await request(app.getHttpServer()).get('/api/work-items').expect(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.items[0].subtasks.completed).toBe(1);

    const page = await request(app.getHttpServer())
      .get('/api/work-items?offset=1&limit=1')
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].id).toBe('wi-2');
  });

  test('GET /api/work-items/:id returns the detail sheet', async () => {
    const response = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(response.body.title).toBe('Fix OOM on api');
    expect(response.body.diagnosisRef).toBe('diag-wi-1');
    await request(app.getHttpServer()).get('/api/work-items/missing').expect(404);
  });

  test('POST triage triggers auto-fix when the boot flag is on', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(200);
    expect(response.body.item.assignee).toBe(AGENT_ASSIGNEE);
    expect(response.body.item.draftPr).toMatchObject({ number: 7 });
    expect(response.body.autoFix).toMatchObject({ ok: true, effect: 'allow', failure: 'none' });
    expect(fixCalls().some((call) => call.method === 'createPullRequest')).toBe(true);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.draftPr).toMatchObject({ number: 7 });
  });

  test('POST triage saves state and reports a thrown auto-fix', async () => {
    await app.close();
    app = await buildApp(fakeFixDeps({ throwOnLoad: true }));
    await app.init();
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(200);
    expect(response.body.item.assignee).toBe(AGENT_ASSIGNEE);
    expect(response.body.autoFix).toMatchObject({
      ok: false,
      effect: 'deny',
      failure: 'fix_error',
      reason: 'context provider failed',
    });
    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.assignee).toBe(AGENT_ASSIGNEE);
  });

  test('POST triage rejects an unknown agent and a malformed assignee', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'needs_agent_Missing Bot' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'human' })
      .expect(422);
    expect(fixCalls()).toHaveLength(0);
  });

  test('POST triage assigns to needs_human and refuses a done work item', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-2/triage')
      .send({ assignee: NEEDS_HUMAN })
      .expect(200);
    expect(response.body.item.assignee).toBe(NEEDS_HUMAN);
    await request(app.getHttpServer())
      .post('/api/work-items/wi-3/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/work-items/missing/triage')
      .send({ assignee: NEEDS_HUMAN })
      .expect(404);
  });

  test('POST fix-now returns the full result with a draft PR ref', async () => {
    const before = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(before.body.fixPriority).toBe(100);

    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({ note: 'Check memory use' })
      .expect(200);
    expect(response.body).toMatchObject({
      ok: true,
      trigger: 'fix_now',
      effect: 'allow',
      failure: 'none',
      reason: null,
      pr: { number: 7 },
    });
    expect(response.body.item.fixPriority).toBe(0);
    expect(response.body.item.draftPr).toMatchObject({ number: 7 });

    const create = fixCalls().find((call) => call.method === 'createPullRequest');
    if (create === undefined) throw new Error('expected a createPullRequest call');
    expect((create.args[1] as { draft: boolean }).draft).toBe(true);

    const after = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(after.body.fixPriority).toBe(0);
    expect(after.body.draftPr).toMatchObject({ number: 7 });
  });

  test('POST fix-now returns the policy denial in the result', async () => {
    await app.close();
    app = await buildApp(fakeFixDeps({ confidence: 0.1 }));
    await app.init();
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      ok: false,
      effect: 'deny',
      failure: 'policy_denied',
      reason: 'low_confidence',
      pr: null,
    });
    expect(response.body.item.fixPriority).toBe(100);
    expect(fixCalls().some((call) => call.method === 'createPullRequest')).toBe(false);
  });

  test('POST fix-now refuses a done item, an unknown id and a bad body', async () => {
    await request(app.getHttpServer()).post('/api/work-items/wi-3/fix-now').send({}).expect(409);
    await request(app.getHttpServer()).post('/api/work-items/missing/fix-now').send({}).expect(404);
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({ unknown: true })
      .expect(422);
    expect(fixCalls()).toHaveLength(0);
  });

  test('GET /api/work-items coerces and bounds the query', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/work-items?offset=0&limit=2')
      .expect(200);
    expect(page.body.offset).toBe(0);
    expect(page.body.limit).toBe(2);
    expect(page.body.items).toHaveLength(2);

    await request(app.getHttpServer()).get('/api/work-items?offset=-1').expect(422);
    await request(app.getHttpServer()).get('/api/work-items?limit=101').expect(422);
    await request(app.getHttpServer()).get('/api/work-items?limit=abc').expect(422);
  });

  test('GET /api/work-items rejects an undeclared query field with 422', async () => {
    await request(app.getHttpServer()).get('/api/work-items?unknown=1').expect(422);
  });

  test('POST fix-now rejects an empty or null note', async () => {
    await Promise.all(
      ['', null].map((note) =>
        request(app.getHttpServer())
          .post('/api/work-items/wi-1/fix-now')
          .send({ note })
          .expect(422),
      ),
    );
    expect(fixCalls()).toHaveLength(0);
  });

  test('POST triage rejects an undeclared field', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: NEEDS_HUMAN, extra: true })
      .expect(422);
  });

  test('POST triage rejects a missing or malformed assignee', async () => {
    await Promise.all(
      [{}, { assignee: 42 }, { assignee: 'needs_humanXYZ' }].map((body) =>
        request(app.getHttpServer()).post('/api/work-items/wi-1/triage').send(body).expect(422),
      ),
    );
  });

  test('POST fix-now accepts a note at the length bound', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({ note: 'x'.repeat(500) })
      .expect(200);
    expect(response.body.ok).toBe(true);
  });
});
