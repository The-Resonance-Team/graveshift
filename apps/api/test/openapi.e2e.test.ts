import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp, createApp } from '../src/app.factory';
import { createOpenApiDocument } from '../src/openapi';

// Set the parsed config value on the app instance before configureApp runs.
// The test owns this setup; production code has no test-only hook.
async function appWithNodeEnv(value: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication({ logger: false });
  instance.get(ConfigService).set('NODE_ENV', value);
  return configureApp(instance);
}

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
    const prodApp = await appWithNodeEnv('production');
    try {
      await prodApp.init();
      await request(prodApp.getHttpServer()).get('/docs').expect(404);
    } finally {
      await prodApp.close();
    }
  });

  test('hides the Swagger UI at /docs when NODE_ENV is a non-lowercase production value', async () => {
    const prodApp = await appWithNodeEnv('Production');
    try {
      await prodApp.init();
      await request(prodApp.getHttpServer()).get('/docs').expect(404);
    } finally {
      await prodApp.close();
    }
  });
});
