import type {
  ConfigAgentsExportResponse,
  ConfigAgentsViewResponse,
  ConfigPolicyExportResponse,
  ConfigPolicyViewResponse,
} from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import request from 'supertest';

import { ALL_SCOPES, MCP_READ_SCOPES, PLUGIN_SCOPES, scopesForKind } from '../src/auth/scopes';
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
          expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
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
    for (const key of SANITIZE_ABSENT_KEYS) expect(response.text).not.toContain(key);
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
    for (const key of SANITIZE_ABSENT_KEYS) expect(response.text).not.toContain(key);
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
    expect(mismatches.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403, 403, 403,
    ]);
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

    expect(audit.appended.length).toBe(2);
    expect(audit.appended.map((entry) => entry.payload)).toEqual([
      { exported: 'agents' },
      { exported: 'policy' },
    ]);
    for (const entry of audit.appended) {
      expect(entry.type).toBe('config.exported');
      expect(entry.actor).toBe(CLIENTS.export.id);
      expect(entry.projectId).toBe('12345');
      expect(Object.keys(entry.payload)).toEqual(['exported']);
      expect(JSON.stringify(entry.payload)).not.toContain('Test Agent');
    }
  });

  test('a failed audit append fails the export closed and serves no config', async () => {
    const failingAudit = new FakeAuditRepo();
    failingAudit.failure = new Error('audit chain unavailable');
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, failingAudit);
    try {
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const response = await request(built.app.getHttpServer())
        .get(EXPORT_ROUTES[0])
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('Test Agent');
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

  test('config scopes stay HTTP-only: the catalog holds them, no credential kind does', async () => {
    // Catalog check: the scopes exist for the #63 OAuth issuer only.
    expect(ALL_SCOPES).toContain('config:read');
    expect(ALL_SCOPES).toContain('config:export');
    expect(MCP_READ_SCOPES).not.toContain('config:read');
    expect(MCP_READ_SCOPES).not.toContain('config:export');
    expect(PLUGIN_SCOPES).not.toContain('config:read');
    expect(PLUGIN_SCOPES).not.toContain('config:export');
    expect(scopesForKind('mcp')).not.toContain('config:read');
    expect(scopesForKind('plugin')).not.toContain('config:export');
    // Choke-point check: CredentialService.issue rejects them for both kinds before
    // any store access, even from a tokens:manage client.
    const token = await bearerToken(app, 'client-1', 'test-client-secret-123456');
    const server = app.getHttpServer();
    const denials = await Promise.all(
      (['mcp', 'plugin'] as const).flatMap((kind) =>
        (['config:read', 'config:export'] as const).map((scope) =>
          request(server)
            .post('/api/credentials')
            .set('Authorization', `Bearer ${token}`)
            .send({ kind, name: `cfg-${kind}-${scope}`, scopes: [scope] }),
        ),
      ),
    );
    expect(denials.map((response) => response.status)).toEqual([403, 403, 403, 403]);
  });
});
