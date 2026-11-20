import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';
import { createApp } from '../src/app.factory';

describe('external API (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await createApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('GET /healthz returns the health response', async () => {
    const response = await request(app.getHttpServer()).get('/healthz').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('GET /docs-json serves the OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.info.title).toBe('Graveshift API');
    expect(response.body.paths['/healthz']).toBeDefined();
  });

  test('unknown routes return 404', async () => {
    await request(app.getHttpServer()).get('/does-not-exist').expect(404);
  });
});
