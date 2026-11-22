import type { ConfigExportResponse } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import request from 'supertest';

import {
  CLIENTS,
  CONFIG_EXPORT_ROUTE,
  FAKE_CONFIG,
  FAKE_CONFIG_PATH,
  FAKE_ENV_VALUES,
  FakeAuditRepo,
  appFromConfigFile,
  bearerToken,
  restoreEnv,
  validated,
  wire,
  withTempConfigFile,
} from './config-test-helpers';

describe('config export endpoint (e2e)', () => {
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
          const response = await request(built.app.getHttpServer()).get(CONFIG_EXPORT_ROUTE);
          expect(response.status).toBe(401);
          expect(JSON.stringify(response.body)).not.toContain('Test Agent');
          expect(built.audit.appended.length).toBe(0);
        } finally {
          await built.app.close();
        }
      },
    );
  });

  test('a config:export token gets the whole validated config and no secret value', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const response = await request(app.getHttpServer())
      .get(CONFIG_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as ConfigExportResponse;
    // One call covers every block. The body is the exact boot-validated object.
    expect(Object.keys(body).sort()).toEqual(['agents', 'boot', 'fix', 'policy']);
    expect(body).toEqual(wire(validated));
    expect(body.boot).toEqual(wire(validated.boot));
    expect(body.agents).toEqual(wire(validated.agents));
    expect(body.policy).toEqual(wire(validated.policy));
    expect(body.fix).toEqual(wire(validated.fix));
    // The export is full: no field is left out of the served config.
    expect(body.agents.system[0]?.prompt).toBe('Handle {{CASE}} for the fake Grave.');
    expect(body.agents.system[0]?.params).toEqual([{ CASE: 'fake case' }]);
    expect(body.policy.approvers.discordUserIds).toEqual(['000000000000000001']);
    expect(body.policy.github.repos[0]?.repo).toBe('fake/ghost-repo');
    expect(body.policy.rules[1]?.when?.signals).toEqual(['memory_pressure']);
    expect(body.policy.rules[1]?.params?.replicas).toEqual({ min: 1, max: 3 });
    // The three credential fields stay names; no value behind them is resolved.
    expect(body.agents.system[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');
    expect(body.fix.github.appIdEnv).toBe('GRAVESHIFT_TEST_GITHUB_APP_ID');
    expect(body.fix.github.privateKeyEnv).toBe('GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY');
    for (const value of Object.values(FAKE_ENV_VALUES)) expect(response.text).not.toContain(value);
    expect(response.text).not.toContain('42424242');
    expect(response.text).not.toContain('FAKE-PRIVATE-KEY-MATERIAL-NEVER-RETURNED');
  });

  test('a token without config:export is denied before any config is served', async () => {
    const exportToken = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const readToken = await bearerToken(app, CLIENTS.read.id, CLIENTS.read.secret);
    const unrelatedToken = await bearerToken(app, CLIENTS.unrelated.id, CLIENTS.unrelated.secret);
    const server = app.getHttpServer();
    const denials = await Promise.all(
      [readToken, unrelatedToken].map((token) =>
        request(server).get(CONFIG_EXPORT_ROUTE).set('Authorization', `Bearer ${token}`),
      ),
    );
    expect(denials.map((response) => response.status)).toEqual([403, 403]);
    for (const response of denials)
      expect(JSON.stringify(response.body)).not.toContain('Test Agent');
    await request(server)
      .get(CONFIG_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${exportToken}`)
      .expect(200);
    // Only the authorized export wrote an audit entry.
    expect(audit.appended.length).toBe(1);
  });

  test('one export writes exactly one audit event with identifiers only', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const server = app.getHttpServer();
    await request(server)
      .get(CONFIG_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server)
      .get(CONFIG_EXPORT_ROUTE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(audit.appended.length).toBe(2);
    for (const entry of audit.appended) {
      expect(entry.type).toBe('config.exported');
      expect(entry.actor).toBe(CLIENTS.export.id);
      expect(entry.projectId).toBe('12345');
      expect(entry.payload).toEqual({ exported: 'config' });
      expect(Object.keys(entry.payload)).toEqual(['exported']);
      // No config content enters the payload.
      expect(JSON.stringify(entry.payload)).not.toContain('Test Agent');
      expect(JSON.stringify(entry.payload)).not.toContain('fake/ghost-repo');
    }
  });

  test('a failed audit append fails the export closed and serves no config', async () => {
    const failingAudit = new FakeAuditRepo();
    failingAudit.failure = new Error('audit chain unavailable');
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, failingAudit);
    try {
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const response = await request(built.app.getHttpServer())
        .get(CONFIG_EXPORT_ROUTE)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('Test Agent');
      expect(JSON.stringify(response.body)).not.toContain('fake-deny-db');
    } finally {
      await built.app.close();
    }
    expect(failingAudit.appended.length).toBe(0);
  });

  test('the endpoint serves the boot snapshot and never re-reads the YAML file', async () => {
    // The app already booted from this file. Mutate it on disk: if the handler re-read the
    // file, the export response would change. The response must stay the boot snapshot.
    const original = await Bun.file(FAKE_CONFIG).text();
    try {
      await Bun.write(FAKE_CONFIG, original.replaceAll('Test Agent', 'Mutated Agent'));
      const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
      const response = await request(app.getHttpServer())
        .get(CONFIG_EXPORT_ROUTE)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.text).not.toContain('Mutated Agent');
      expect(response.body as ConfigExportResponse).toEqual(wire(validated));
    } finally {
      await Bun.write(FAKE_CONFIG, original);
    }
  });

  test('the config endpoint exposes no write method', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all([
      request(server).post(CONFIG_EXPORT_ROUTE),
      request(server).put(CONFIG_EXPORT_ROUTE),
      request(server).patch(CONFIG_EXPORT_ROUTE),
      request(server).delete(CONFIG_EXPORT_ROUTE),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });

  test('the removed config routes are gone', async () => {
    const token = await bearerToken(app, CLIENTS.export.id, CLIENTS.export.secret);
    const removedRoutes = [
      '/api/config/agents',
      '/api/config/policy',
      '/api/config/agents/export',
      '/api/config/policy/export',
    ] as const;
    const responses = await Promise.all(
      removedRoutes.map((route) =>
        request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${token}`),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });
});
