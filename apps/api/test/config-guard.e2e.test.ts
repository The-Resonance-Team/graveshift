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
  CONFIG_EXPORT_ROUTE,
  FAKE_CONFIG_PATH,
  appFromConfigFile,
  bearerToken,
  restoreEnv,
} from './config-test-helpers';
import { setupAuthDatabase } from './database/auth.fixture';
import { dbTestEnabled } from './database/fixtures';

// The guards in front of the one config endpoint: ThrottlerGuard and the scope catalog.
describe.skipIf(!dbTestEnabled)('config guards (e2e)', () => {
  const fixture = setupAuthDatabase();
  let app: INestApplication;

  beforeEach(async () => {
    const built = await appFromConfigFile(fixture, FAKE_CONFIG_PATH);
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
    restoreEnv();
  });

  test('the config endpoint is rate limited before the handler runs', async () => {
    // An export takes a serialized audit transaction, so ThrottlerGuard must cap the
    // surface. With a limit of three, the fourth call in the window is denied by the
    // guard and never reaches AuditRepo.
    const built = await appFromConfigFile(fixture, FAKE_CONFIG_PATH, fixture.audit, {
      eventRateLimit: 3,
      eventRateTtlMs: 60_000,
    });
    try {
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(built.app.getHttpServer())
            .get(CONFIG_EXPORT_ROUTE)
            .set('Authorization', `Bearer ${token}`),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 200).length).toBe(3);
      expect(statuses.filter((status) => status === 429).length).toBe(3);
      // Only the three allowed calls reached the handler and its audit append.
      expect(
        await fixture.db.auditEntry.count({
          where: { projectId: '12345', type: 'config.exported' },
        }),
      ).toBe(3);
    } finally {
      await built.app.close();
    }
  });

  test('config:export stays HTTP-only: the catalog holds it, no credential kind does', async () => {
    // Catalog check: the scope exists for the #63 OAuth issuer only. The removed
    // config:read scope must not return to the catalog.
    expect(ALL_SCOPES).toContain('config:export');
    expect(ALL_SCOPES).not.toContain('config:read');
    expect(CREDENTIAL_ISSUABLE_SCOPES).not.toContain('config:export');
    expect(MCP_READ_SCOPES).not.toContain('config:export');
    expect(PLUGIN_SCOPES).not.toContain('config:export');
    expect(scopesForKind('mcp')).not.toContain('config:export');
    expect(scopesForKind('plugin')).not.toContain('config:export');

    // Request check: the DTO rejects a config scope before any credential store is read.
    // The document side of this rule is asserted in packages/api-contract.
    const token = await bearerToken(app, 'client-1', 'test-client-secret-123456');
    const server = app.getHttpServer();
    const denials = await Promise.all(
      (['mcp', 'plugin'] as const).map((kind) =>
        request(server)
          .post('/api/credentials')
          .set('Authorization', `Bearer ${token}`)
          .send({ kind, name: `cfg-${kind}`, scopes: ['config:export'] }),
      ),
    );
    expect(denials.length).toBe(2);
    expect(denials.every((response) => response.status === 422)).toBe(true);

    // Choke-point check: even a request DTO that bypassed validation is denied by the
    // service for both kinds, before any store access.
    const credentialService = app.get(CredentialService, { strict: false });
    const principal = { clientId: 'client-1', projectId: '12345', scopes: ['tokens:manage'] };
    const attempts = (['mcp', 'plugin'] as const).map(async (kind) => {
      try {
        await credentialService.issue(
          { kind, name: `cfg-${kind}`, scopes: ['config:export'] },
          principal,
        );
        return undefined;
      } catch (error) {
        return error;
      }
    });
    const denialsFromService = await Promise.all(attempts);
    expect(denialsFromService.length).toBe(2);
    expect(denialsFromService.every((error) => error instanceof ForbiddenException)).toBe(true);
  });
});
