import type {
  ConfigAgentsExportResponse,
  ConfigAgentsViewResponse,
  ConfigExportResponse,
  ConfigPolicyExportResponse,
  ConfigPolicyViewResponse,
} from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import request from 'supertest';

import {
  CLIENTS,
  EXPORT_ROUTES,
  EXPECTED_AGENTS_VIEW,
  EXPECTED_POLICY_VIEW,
  FAKE_CONFIG,
  FAKE_CONFIG_PATH,
  FAKE_ENV_VALUES,
  FakeAuditRepo,
  READ_ROUTES,
  SANITIZE_ABSENT_KEYS,
  SANITIZE_ABSENT_VALUES,
  WHOLE_EXPORT_ROUTE,
  appFromConfigFile,
  bearerToken,
  restoreEnv,
  validated,
  wire,
  withTempConfigFile,
} from './config-test-helpers';

describe('config read-only API (e2e)', () => {
  let app!: INestApplication;
  let audit!: FakeAuditRepo;

  beforeEach(async () => {
    audit = new FakeAuditRepo();
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, audit);
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
    restoreEnv();
  });

  test('anonymous GET is denied with 401 before any config is read', async () => {
    // The file is removed after boot: a 401 that survives proves the deny path never
    // touches disk, because the config was read once at boot and frozen.
    await withTempConfigFile(
      'config.anonymous.yaml',
      await Bun.file(FAKE_CONFIG).text(),
      async (path) => {
        const built = await appFromConfigFile(path);
        try {
          await unlink(path);
          const responses = await Promise.all(
            [...READ_ROUTES, ...EXPORT_ROUTES].map((route) =>
              request(built.app.getHttpServer()).get(route),
            ),
          );
          expect(responses.map((response) => response.status)).toEqual(
            [...READ_ROUTES, ...EXPORT_ROUTES].map(() => 401),
          );
        } finally {
          await built.app.close();
        }
      },
    );
  });

  test('a config:read token gets exactly the sanitized Agent view', async () => {
    const token = await bearerToken(app, CLIENTS.read.id, CLIENTS.read.secret);
    const response = await request(app.getHttpServer())
      .get('/api/config/agents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body as ConfigAgentsViewResponse).toEqual(wire(EXPECTED_AGENTS_VIEW));
    // The declared names are published; the param values are not.
    expect((response.body as ConfigAgentsViewResponse).system[0]?.params).toEqual(['CASE']);
    for (const key of SANITIZE_ABSENT_KEYS) expect(response.text).not.toContain(key);
    for (const value of SANITIZE_ABSENT_VALUES) expect(response.text).not.toContain(value);
    expect(response.text).not.toContain('GRAVESHIFT_TEST_AGENT_API_KEY');
    for (const value of Object.values(FAKE_ENV_VALUES)) expect(response.text).not.toContain(value);
  });

  test('a config:read token gets exactly the sanitized policy view', async () => {
    const token = await bearerToken(app, CLIENTS.read.id, CLIENTS.read.secret);
    const response = await request(app.getHttpServer())
      .get('/api/config/policy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body as ConfigPolicyViewResponse).toEqual(wire(EXPECTED_POLICY_VIEW));
    // A rule is published as id, action and effect: no condition and no replica bound.
    expect(Object.keys((response.body as ConfigPolicyViewResponse).rules[1] ?? {})).toEqual([
      'id',
      'action',
      'effect',
    ]);
    for (const key of [...SANITIZE_ABSENT_KEYS, '"params"'])
      expect(response.text).not.toContain(key);
    for (const value of SANITIZE_ABSENT_VALUES) expect(response.text).not.toContain(value);
    expect(response.text).not.toContain('000000000000000001');
    expect(response.text).not.toContain('fake/ghost-repo');
  });

  test('a config:export token gets the full Agent config but no secret value', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const response = await request(app.getHttpServer())
      .get('/api/config/agents/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as ConfigAgentsExportResponse;
    expect(body).toEqual(wire(validated.agents));
    // apiKeyEnv stays a variable name; its value and the key never appear.
    expect(body.system[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');
    expect(body.client[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_CLIENT_API_KEY');
    for (const value of Object.values(FAKE_ENV_VALUES)) expect(response.text).not.toContain(value);
  });

  test('a config:export token gets the full policy config but no secret value', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const response = await request(app.getHttpServer())
      .get('/api/config/policy/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body as ConfigPolicyExportResponse).toEqual(wire(validated.policy));
    for (const value of Object.values(FAKE_ENV_VALUES)) expect(response.text).not.toContain(value);
  });

  test('one config:export call returns every block of the full config and no secret value', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const response = await request(app.getHttpServer())
      .get(WHOLE_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as ConfigExportResponse;
    // The one call covers boot, agents, policy and fix: no per-block request is needed.
    expect(Object.keys(body).sort()).toEqual(['agents', 'boot', 'fix', 'policy']);
    expect(body).toEqual(wire(validated));
    // The three env names stay names, and the value behind each of them never appears.
    expect(body.agents.system[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');
    expect(body.fix.github.appIdEnv).toBe('GRAVESHIFT_TEST_GITHUB_APP_ID');
    expect(body.fix.github.privateKeyEnv).toBe('GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY');
    for (const value of Object.values(FAKE_ENV_VALUES)) expect(response.text).not.toContain(value);
    expect(response.text).not.toContain('42424242');
  });

  test('the exact scope for the route is enforced on every config route', async () => {
    const readToken = await bearerToken(app, CLIENTS.read.id, CLIENTS.read.secret);
    const exportToken = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const unrelatedToken = await bearerToken(app, CLIENTS.unrelated.id, CLIENTS.unrelated.secret);
    const server = app.getHttpServer();
    // config:read on export routes, config:export on read routes, unrelated scope
    // everywhere: denied.
    const mismatches = await Promise.all([
      ...EXPORT_ROUTES.map((route) =>
        request(server).get(route).set('Authorization', `Bearer ${readToken}`),
      ),
      ...READ_ROUTES.map((route) =>
        request(server).get(route).set('Authorization', `Bearer ${exportToken}`),
      ),
      ...[...READ_ROUTES, ...EXPORT_ROUTES].map((route) =>
        request(server).get(route).set('Authorization', `Bearer ${unrelatedToken}`),
      ),
    ]);
    const expected = [
      ...EXPORT_ROUTES.map(() => 403),
      ...READ_ROUTES.map(() => 403),
      ...[...READ_ROUTES, ...EXPORT_ROUTES].map(() => 403),
    ];
    expect(mismatches.map((response) => response.status)).toEqual(expected);
  });

  test('one export writes exactly one audit event and a read writes none', async () => {
    const readToken = await bearerToken(app, CLIENTS.read.id, CLIENTS.read.secret);
    const server = app.getHttpServer();
    await request(server)
      .get(READ_ROUTES[0])
      .set('Authorization', `Bearer ${readToken}`)
      .expect(200);
    await request(server)
      .get(READ_ROUTES[1])
      .set('Authorization', `Bearer ${readToken}`)
      .expect(200);
    expect(audit.appended.length).toBe(0);

    const exportToken = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    await request(server)
      .get(EXPORT_ROUTES[0])
      .set('Authorization', `Bearer ${exportToken}`)
      .expect(200);
    await request(server)
      .get(EXPORT_ROUTES[1])
      .set('Authorization', `Bearer ${exportToken}`)
      .expect(200);
    await request(server)
      .get(WHOLE_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${exportToken}`)
      .expect(200);

    // One entry per export, and nothing extra for the reads.
    expect(audit.appended.length).toBe(3);
    expect(audit.appended.map((entry) => entry.payload)).toEqual([
      { exported: 'agents' },
      { exported: 'policy' },
      { exported: 'config' },
    ]);
    for (const entry of audit.appended) {
      expect(entry.type).toBe('config.exported');
      expect(entry.actor).toBe(CLIENTS.export.id);
      expect(entry.projectId).toBe('12345');
      expect(Object.keys(entry.payload)).toEqual(['exported']);
      expect(JSON.stringify(entry.payload)).not.toContain('Test Agent');
    }
  });

  test('a failed audit append fails every export closed and serves no config', async () => {
    const failingAudit = new FakeAuditRepo();
    failingAudit.failure = new Error('audit chain unavailable');
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, failingAudit);
    try {
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const responses = await Promise.all(
        [EXPORT_ROUTES[0], EXPORT_ROUTES[1], WHOLE_EXPORT_ROUTE].map((route) =>
          request(built.app.getHttpServer()).get(route).set('Authorization', `Bearer ${token}`),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual([500, 500, 500]);
      for (const response of responses) {
        expect(JSON.stringify(response.body)).not.toContain('Test Agent');
        expect(JSON.stringify(response.body)).not.toContain('fake-deny-db');
      }
    } finally {
      await built.app.close();
    }
    expect(failingAudit.appended.length).toBe(0);
  });

  test('the routes serve the boot snapshot and never re-read the YAML file', async () => {
    // The app already booted from this file. Mutate it on disk: if a route re-read the
    // file, the export response would change. The response must stay the boot snapshot.
    const original = await Bun.file(FAKE_CONFIG).text();
    try {
      await Bun.write(FAKE_CONFIG, original.replaceAll('Test Agent', 'Mutated Agent'));
      const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
      const response = await request(app.getHttpServer())
        .get(EXPORT_ROUTES[0])
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.text).not.toContain('Mutated Agent');
      const body = response.body as ConfigAgentsExportResponse;
      expect(body.system[0]?.name).toBe('Test Agent');
      expect(body).toEqual(wire(validated.agents));
    } finally {
      await Bun.write(FAKE_CONFIG, original);
    }
  });

  test('the config routes expose no write endpoint', async () => {
    const server = app.getHttpServer();
    const routes = [...READ_ROUTES, ...EXPORT_ROUTES];
    const responses = await Promise.all(
      routes.flatMap((route) => [
        request(server).post(route),
        request(server).put(route),
        request(server).patch(route),
        request(server).delete(route),
      ]),
    );
    expect(responses.every((response) => response.status === 404)).toBe(true);
    expect(responses.length).toBe(routes.length * 4);
  });
});
