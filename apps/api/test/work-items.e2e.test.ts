import { createSubtasks, NEEDS_HUMAN, promoteToFront, type WorkItem } from '@graveshift/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { FixService } from '../src/fix/fix.service';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from '../src/work-items/work-item.policy';
import { WORK_ITEM_SEED, WorkItemStore } from '../src/work-items/work-item.store';

const AGENT_ASSIGNEE = 'needs_agent_SRE Bot';

const POLICY: WorkItemPolicy = {
  agentNames: ['SRE Bot'],
  clientConfig: { autoFixAllowed: true },
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
    autoFixAllowed: false,
    fixPriority: 100,
    ...overrides,
  };
}

// The e2e pass injects a fixed use case. No gateway, GitHub client or policy file is used.
const fakeFixer = {
  async fixNow(workItem: WorkItem) {
    return {
      item: promoteToFront(workItem),
      trigger: 'fix_now',
      effect: 'allow',
      ok: true,
    } as const;
  },
};

// The tests bring their own store and policy. No agent YAML file or demo seed is read.
async function buildApp(): Promise<INestApplication> {
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
    .overrideProvider(FixService)
    .useValue(fakeFixer)
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
    expect(response.body.offset).toBe(0);
    expect(response.body.limit).toBe(20);
    expect(response.body.items[0]).toHaveProperty('successCriteria');
    expect(response.body.items[0].subtasks.completed).toBe(1);

    const page = await request(app.getHttpServer())
      .get('/api/work-items?offset=1&limit=1')
      .expect(200);
    expect(page.body.total).toBe(3);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].id).toBe('wi-2');
  });

  test('GET /api/work-items/:id returns the detail sheet', async () => {
    const response = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(response.body.id).toBe('wi-1');
    expect(response.body.title).toBe('Fix OOM on api');
    expect(response.body.diagnosisRef).toBe('diag-wi-1');
    expect(response.body.subtasks.completed).toBe(1);
    await request(app.getHttpServer()).get('/api/work-items/missing').expect(404);
  });

  test('POST triage assigns to an existing agent and persists the change', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(200);
    expect(response.body.assignee).toBe(AGENT_ASSIGNEE);
    expect(response.body.autoFixAllowed).toBe(true);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.assignee).toBe(AGENT_ASSIGNEE);
  });

  test('POST triage rejects an unknown agent name', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'needs_agent_Missing Bot' })
      .expect(400);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.assignee).toBe(NEEDS_HUMAN);
  });

  test('POST triage assigns to needs_human', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-2/triage')
      .send({ assignee: NEEDS_HUMAN })
      .expect(200);
    expect(response.body.assignee).toBe(NEEDS_HUMAN);
  });

  test('POST triage rejects a malformed assignee and an unknown work item', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'human' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/work-items/missing/triage')
      .send({ assignee: NEEDS_HUMAN })
      .expect(404);
  });

  test('POST triage refuses a done work item and leaves it unchanged', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-3/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(409);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-3').expect(200);
    expect(detail.body.assignee).toBe(NEEDS_HUMAN);
    expect(detail.body.autoFixAllowed).toBe(false);
  });

  test('POST fix-now moves the work item to the front of the fix queue', async () => {
    const before = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(before.body.fixPriority).toBe(100);

    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({ note: 'Check memory use' })
      .expect(200);
    expect(response.body.fixPriority).toBe(0);

    const after = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(after.body.fixPriority).toBe(0);
  });

  test('POST fix-now rejects an unknown work item and a bad body', async () => {
    await request(app.getHttpServer()).post('/api/work-items/missing/fix-now').send({}).expect(404);
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/fix-now')
      .send({ unknown: true })
      .expect(400);
  });
});
