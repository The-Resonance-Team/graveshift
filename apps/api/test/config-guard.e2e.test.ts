import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import {
  ALL_SCOPES,
  CREDENTIAL_ISSUABLE_SCOPES,
  MCP_READ_SCOPES,
  PLUGIN_SCOPES,
  scopesForKind,
} from '../src/auth/scopes';
import { CredentialService } from '../src/auth/services/credential.service';
import {
  CLIENTS,
  FAKE_CONFIG_PATH,
  FakeAuditRepo,
  WHOLE_EXPORT_ROUTE,
  appFromConfigFile,
  bearerToken,
  restoreEnv,
} from './config-test-helpers';

// The two guards in front of the config routes: ThrottlerGuard and the scope catalog.
describe('config guards (e2e)', () => {
  let app: INestApplication;
  let audit: FakeAuditRepo;

  beforeEach(async () => {
    audit = new FakeAuditRepo();
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, audit);
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
    restoreEnv();
  });

  test('every config route is rate limited before the handler runs', async () => {
    // An export takes a serialized audit transaction, so ThrottlerGuard must cap the
    // surface. With a limit of three, the fourth call in the window is denied by the
    // guard and never reaches AuditRepo.
    const throttledAudit = new FakeAuditRepo();
    const built = await appFromConfigFile(FAKE_CONFIG_PATH, throttledAudit, {
      eventRateLimit: 3,
      eventRateTtlMs: 60_000,
    });
    try {
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(built.app.getHttpServer())
            .get(WHOLE_EXPORT_ROUTE)
            .set('Authorization', `Bearer ${token}`),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200).length).toBe(3);
      expect(statuses.filter((status) => status === 429).length).toBe(3);
      // Only the three allowed calls reached the handler and its audit append.
      expect(throttledAudit.appended.length).toBe(3);
    } finally {
      await built.app.close();
    }
  });

  test('config scopes stay HTTP-only: the catalog holds them, no credential kind does', async () => {
    // Catalog check: the scopes exist for the #63 OAuth issuer only.
    expect(ALL_SCOPES).toContain('config:read');
    expect(ALL_SCOPES).toContain('config:export');
    expect(CREDENTIAL_ISSUABLE_SCOPES).not.toContain('config:read');
    expect(CREDENTIAL_ISSUABLE_SCOPES).not.toContain('config:export');
    expect(MCP_READ_SCOPES).not.toContain('config:read');
    expect(MCP_READ_SCOPES).not.toContain('config:export');
    expect(PLUGIN_SCOPES).not.toContain('config:read');
    expect(PLUGIN_SCOPES).not.toContain('config:export');
    expect(scopesForKind('mcp')).not.toContain('config:read');
    expect(scopesForKind('plugin')).not.toContain('config:export');

    // Request check: the DTO rejects a config scope before any credential store is read.
    // The document side of this rule is asserted in packages/api-contract.
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
    expect(denials.length).toBe(4);
    expect(denials.every((response) => response.status === 422)).toBe(true);

    // Choke-point check: even a request DTO that bypassed validation is denied by the
    // service for both kinds, before any store access.
    const credentialService = app.get(CredentialService, { strict: false });
    const principal = { clientId: 'client-1', projectId: '12345', scopes: ['tokens:manage'] };
    const attempts = (['mcp', 'plugin'] as const).flatMap((kind) =>
      (['config:read', 'config:export'] as const).map(async (scope) => {
        try {
          await credentialService.issue(
            { kind, name: `cfg-${kind}-${scope}`, scopes: [scope] },
            principal,
          );
          return undefined;
        } catch (error) {
          return error;
        }
      }),
    );
    const denialsFromService = await Promise.all(attempts);
    expect(denialsFromService.length).toBe(4);
    expect(denialsFromService.every((error) => error instanceof ForbiddenException)).toBe(true);
  });
});
