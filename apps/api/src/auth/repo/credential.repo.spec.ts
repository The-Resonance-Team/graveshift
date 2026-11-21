import { describe, expect, test } from 'bun:test';

import { FakeCredentialRepo } from '../../../test/fakes/fake-credential-repo';
import type { CredentialRecord, Principal } from '../auth.types';
import { CredentialLimitError } from './credential.repo';

const principal: Principal = {
  clientId: 'client-1',
  tenantId: 'tenant-1',
  scopes: ['tokens:manage', 'events:publish'],
};

const record = (id: string, hash: string): CredentialRecord => ({
  id,
  kind: 'plugin',
  name: id,
  prefix: 'plugin_abcdef12',
  hash,
  clientId: principal.clientId,
  tenantId: principal.tenantId,
  scopes: ['events:publish'],
  service: null,
  projectId: null,
  createdAt: new Date().toISOString(),
  expiresAt: null,
  revokedAt: null,
  expirationAuditedAt: null,
});

describe('credential repository contract', () => {
  test('stores only the hash, scopes by principal and emits a create event', async () => {
    const repo = new FakeCredentialRepo();
    await repo.add(record('cred-1', 'a'.repeat(64)));
    expect(await repo.findByHash('a'.repeat(64))).toMatchObject({ id: 'cred-1' });
    expect(await repo.list(principal)).toHaveLength(1);
    expect(await repo.list({ ...principal, tenantId: 'tenant-2' })).toEqual([]);
    expect(repo.auditEvents).toEqual([
      {
        actor: 'client-1',
        type: 'credential.created',
        payload: { credentialId: 'cred-1', kind: 'plugin', name: 'cred-1' },
      },
    ]);
  });

  test('limits concurrent issue calls and records revocation once', async () => {
    const repo = new FakeCredentialRepo();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        repo.add(record(`cred-${index}`, `${index}`.repeat(64))),
      ),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(10);
    expect(
      results.filter(
        (item) => item.status === 'rejected' && item.reason instanceof CredentialLimitError,
      ),
    ).toHaveLength(2);

    expect(await repo.revoke('cred-0', principal, new Date().toISOString())).toBe(true);
    expect(await repo.revoke('cred-0', principal, new Date().toISOString())).toBe(true);
    expect(repo.auditEvents.filter((event) => event.type === 'credential.revoked')).toHaveLength(1);
  });
});
