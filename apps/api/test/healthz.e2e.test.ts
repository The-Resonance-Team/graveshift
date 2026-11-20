import { describe, expect, test } from 'bun:test';
import request from 'supertest';
import { createApp } from '../src/app.factory.js';

describe('GET /healthz (e2e)', () => {
  test('returns the health response from the real Nest app', async () => {
    const app = await createApp();
    await app.init();

    try {
      const response = await request(app.getHttpServer()).get('/healthz').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
