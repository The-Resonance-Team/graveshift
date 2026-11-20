import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { createApp } from '../src/app.factory';

const AGENT_ASSIGNEE = 'needs_agent_SRE Bot';

describe('work items API (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await createApp();
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
    expect(response.body.diagnosisRef).toBe('diag-1');
    expect(response.body.subtasks.completed).toBe(1);
    await request(app.getHttpServer()).get('/api/work-items/missing').expect(404);
  });

  test('POST triage assigns to an existing agent and persists the change', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: AGENT_ASSIGNEE })
      .expect(200);
    expect(response.body.assignee).toBe(AGENT_ASSIGNEE);
    expect(response.body.autoFixAllowed).toBe(false);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.assignee).toBe(AGENT_ASSIGNEE);
  });

  test('POST triage rejects an unknown agent name', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'needs_agent_Missing Bot' })
      .expect(400);

    const detail = await request(app.getHttpServer()).get('/api/work-items/wi-1').expect(200);
    expect(detail.body.assignee).not.toBe('needs_agent_Missing Bot');
  });

  test('POST triage assigns to needs_human', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/work-items/wi-2/triage')
      .send({ assignee: 'needs_human' })
      .expect(200);
    expect(response.body.assignee).toBe('needs_human');
  });

  test('POST triage rejects a malformed assignee and an unknown work item', async () => {
    await request(app.getHttpServer())
      .post('/api/work-items/wi-1/triage')
      .send({ assignee: 'human' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/work-items/missing/triage')
      .send({ assignee: 'needs_human' })
      .expect(404);
  });
});
