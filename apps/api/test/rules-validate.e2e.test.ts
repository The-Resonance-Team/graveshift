import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';
import { createApp } from '../src/app.factory';

const systemRule = {
  id: 'rule-1',
  enabled: true,
  priority: 10,
  match: { services: ['api'] },
  action: 'suppress',
};
const clientOverride = { ...systemRule, action: 'escalate' };
const clientRule = {
  id: 'rule-2',
  enabled: true,
  priority: 20,
  match: {},
  action: 'detect',
};

describe('POST /api/rules/validate (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await createApp();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  test('accepts a rule set with no overrides', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [systemRule], clientRules: [clientRule] })
      .expect(200);
    expect(response.body).toEqual({ accepted: true, overrideIds: [], warning: '' });
    expect(response.body.accepted).toBe(true);
  });

  test('rejects an override without confirmation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [systemRule], clientRules: [clientOverride] })
      .expect(409);
    expect(response.body.overrideIds).toEqual(['rule-1']);
    expect(response.body.warning).toContain('Confirm the rule overrides before save.');
  });

  test('accepts a confirmed override and returns the warning', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [systemRule],
        clientRules: [clientOverride],
        confirmOverrides: true,
      })
      .expect(200);
    expect(response.body).toEqual({
      accepted: true,
      overrideIds: ['rule-1'],
      warning: expect.stringContaining('rule-1'),
    });
  });

  test('rejects an unknown action', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [{ ...systemRule, action: 'delete' }],
        clientRules: [],
      })
      .expect(422);
  });

  test('rejects duplicate ids in one layer', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [systemRule],
        clientRules: [clientRule, { ...clientRule, action: 'suppress' }],
      })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [systemRule, { ...systemRule, priority: 20 }],
        clientRules: [],
      })
      .expect(422);
  });

  test('rejects more than 200 rules in one layer', async () => {
    const manyRules = Array.from({ length: 201 }, (_, index) => ({
      ...systemRule,
      id: `rule-${index}`,
    }));
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: manyRules, clientRules: [] })
      .expect(422);
  });

  test('rejects a missing field', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ clientRules: [] })
      .expect(422);
  });

  test('rejects an undeclared field with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [], clientRules: [], unknown: true })
      .expect(422);
  });

  test('rejects null for an optional body field', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [], clientRules: [], confirmOverrides: null })
      .expect(422);
  });

  test('rejects null for a nested match field', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [{ ...systemRule, match: { severities: null } }],
        clientRules: [],
      })
      .expect(422);
  });

  test('rejects an invalid nested match', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [{ ...systemRule, match: { severities: ['bogus'] } }],
        clientRules: [],
      })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [{ ...systemRule, match: [] }], clientRules: [] })
      .expect(422);
  });

  test('rejects an unknown key inside a rule and inside a match', async () => {
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [{ ...systemRule, extra: true }], clientRules: [] })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({
        systemRules: [{ ...systemRule, match: { extra: true } }],
        clientRules: [],
      })
      .expect(422);
  });

  test('accepts a complete valid request with every match filter', async () => {
    const fullRule = {
      ...systemRule,
      match: {
        severities: ['warning'],
        services: ['api'],
        types: ['graveshift.oom'],
        tenantId: 'tenant_1',
      },
    };
    const response = await request(app.getHttpServer())
      .post('/api/rules/validate')
      .send({ systemRules: [fullRule], clientRules: [], confirmOverrides: true })
      .expect(200);
    expect(response.body).toEqual({ accepted: true, overrideIds: [], warning: '' });
  });
});
