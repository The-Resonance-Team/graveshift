import { describe, expect, test } from 'bun:test';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { FakeCredentialRepo } from '../../../test/fakes/fake-credential-repo';
import type { CredentialRecord, Principal } from '../auth.types';
import { CredentialService } from '../services/credential.service';
import { CredentialLimitError } from './credential.repo';

const principal: Principal = {
  clientId: 'client-1',
  projectId: '12345',
  scopes: ['tokens:manage', 'incidents:read', 'events:publish'],
};
const dto = { kind: 'mcp', name: 'reader', scopes: ['incidents:read'] } as const;
const issue = (service: CredentialService) =>
  service.issue({ ...dto, scopes: [...dto.scopes] }, principal);

const record = (id: string, hash: string): CredentialRecord => ({
  id,
  kind: 'plugin',
  name: id,
  prefix: 'plugin_abcdef12',
  hash,
  clientId: principal.clientId,
  projectId: principal.projectId,
  scopes: ['events:publish'],
  service: null,
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
    expect(await repo.list({ ...principal, projectId: 'project-2' })).toEqual([]);
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

  test('two issuers share the atomic owner cap', async () => {
    const repo = new FakeCredentialRepo();
    const first = new CredentialService(repo, TEST_CONFIG);
    const second = new CredentialService(repo, TEST_CONFIG);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => issue(index % 2 ? first : second)),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(10);
    expect(repo.auditEvents).toHaveLength(10);
  });

  test('audit failure prevents issuance and revocation', async () => {
    const repo = new FakeCredentialRepo();
    const service = new CredentialService(repo, TEST_CONFIG);
    const failure = new Error('audit unavailable');
    repo.auditFailure = failure;
    await expect(issue(service)).rejects.toBe(failure);
    expect(repo.records).toEqual([]);
    repo.auditFailure = undefined;
    const credential = await issue(service);
    repo.auditFailure = failure;
    await expect(service.revoke(credential.id, principal)).rejects.toBe(failure);
    await expect(service.verify(credential.value)).resolves.toHaveProperty('id', credential.id);
    expect(repo.auditEvents).toHaveLength(1);
  });

  test('revocation and expiry emit one stable, secret-free event', async () => {
    const repo = new FakeCredentialRepo();
    const service = new CredentialService(repo, TEST_CONFIG);
    const credential = await issue(service);
    await service.revoke(credential.id, principal);
    await service.revoke(credential.id, principal);
    const expired = await issue(service);
    const stored = repo.records.find((item) => item.id === expired.id);
    if (!stored) throw new Error('Missing issued fixture');
    stored.expiresAt = '2020-01-01T00:00:00.000Z';
    await expect(service.verify(expired.value)).rejects.toHaveProperty('status', 401);
    await expect(service.verify(expired.value)).rejects.toHaveProperty('status', 401);
    expect(repo.auditEvents.filter((event) => event.type === 'credential.revoked')).toHaveLength(1);
    expect(repo.auditEvents.filter((event) => event.type === 'credential.expired')).toHaveLength(1);
    expect(JSON.stringify(repo.auditEvents)).not.toContain(credential.value);
    expect(JSON.stringify(repo.auditEvents)).not.toContain(stored.hash);
  });
});
