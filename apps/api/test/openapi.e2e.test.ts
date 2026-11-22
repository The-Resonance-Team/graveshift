import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { createApp } from '../src/app.factory';
import { createOpenApiDocument } from '../src/openapi';

describe('OpenAPI document (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await createApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('keeps request bodies and the 422 validation response', () => {
    const document = createOpenApiDocument(app);
    expect(document.openapi).toMatch(/^3\./);

    const rules = document.paths['/api/rules/validate']?.post;
    const triage = document.paths['/api/work-items/{id}/triage']?.post;
    const fixNow = document.paths['/api/work-items/{id}/fix-now']?.post;
    if (rules === undefined || triage === undefined || fixNow === undefined) {
      throw new Error('expected the rule and work item routes in the OpenAPI document');
    }

    for (const operation of [rules, triage, fixNow]) {
      expect(operation.requestBody).toBeDefined();
      expect(operation.responses).toHaveProperty('422');
    }
    const schemas = document.components?.schemas;
    expect(JSON.stringify(schemas?.ValidateRulesDto)).toContain('systemRules');
    expect(JSON.stringify(schemas?.TriageRequestDto)).toContain('assignee');
    expect(JSON.stringify(schemas?.FixNowRequestDto)).toContain('note');
  });

  test('hides the Swagger UI at /docs when NODE_ENV is production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let prodApp: INestApplication | undefined;
    try {
      prodApp = await createApp();
      await prodApp.init();
      await request(prodApp.getHttpServer()).get('/docs').expect(404);
    } finally {
      await prodApp?.close();
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
