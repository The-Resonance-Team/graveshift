import { describe, expect, test } from 'bun:test';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { FakeCredentialRepo } from '../../../test/fakes/fake-credential-repo';
import { CreateCredentialDto } from '../dto/create-credential.dto';
import type { Principal } from '../auth.types';
import { CredentialService } from './credential.service';

const principal: Principal = {
  clientId: 'client-1',
  tenantId: 'tenant-1',
  scopes: ['tokens:manage', 'incidents:read', 'events:publish'],
};

function dto(overrides: Partial<CreateCredentialDto> = {}): CreateCredentialDto {
  return Object.assign(new CreateCredentialDto(), {
    kind: 'mcp',
    name: 'reader',
    scopes: ['incidents:read'],
    ...overrides,
  });
}

function setup() {
  const repo = new FakeCredentialRepo();
  return { repo, service: new CredentialService(repo, TEST_CONFIG) };
}

describe('CredentialService', () => {
  test('stores only a hash and shows the value once', async () => {
    const { repo, service } = setup();
    const issued = await service.issue(dto(), principal);
    expect(issued.value.length).toBeGreaterThan(32);
    expect(repo.records[0]?.hash).not.toContain(issued.value);
    expect(repo.records[0]).not.toHaveProperty('value');
    expect(repo.records[0]?.prefix).toBe(issued.prefix);
  });

  test('verifies a presented value and returns the principal', async () => {
    const { service } = setup();
    const issued = await service.issue(dto(), principal);
    const verified = await service.verify(issued.value);
    expect(verified.clientId).toBe('client-1');
    expect(verified.tenantId).toBe('tenant-1');
    expect(verified.kind).toBe('mcp');
  });

  test('refuses an unknown value and a value for another kind', async () => {
    const { service } = setup();
    const mcp = await service.issue(dto(), principal);
    expect(service.verify('x'.repeat(32))).rejects.toThrow();
    expect(service.verify(mcp.value, 'plugin')).rejects.toThrow();
  });

  test('refuses a revoked or expired credential', async () => {
    const { repo, service } = setup();
    const issued = await service.issue(dto(), principal);
    await service.revoke(issued.id, principal.clientId);
    expect(service.verify(issued.value)).rejects.toThrow();

    const second = await service.issue(dto({ name: 'old' }), principal);
    const record = repo.records.find((item) => item.id === second.id);
    if (record) record.expiresAt = '2020-01-01T00:00:00.000Z';
    expect(service.verify(second.value)).rejects.toThrow();
  });

  test('enforces the scope catalog and the client holdings', async () => {
    const { service } = setup();
    expect(service.issue(dto({ scopes: ['tokens:manage'] }), principal)).rejects.toThrow();
    expect(service.issue(dto({ scopes: ['events:publish'] }), principal)).rejects.toThrow();
    expect(service.issue(dto({ scopes: ['audit:read'] }), principal)).rejects.toThrow();
    expect(
      service.issue(dto({ kind: 'plugin', scopes: ['events:publish'] }), principal),
    ).resolves.toBeDefined();
  });

  test('lists metadata and revokes only own credentials', async () => {
    const { service } = setup();
    const issued = await service.issue(dto(), principal);
    const list = await service.list('client-1');
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('value');
    expect(list[0]).not.toHaveProperty('hash');
    expect(await service.list('client-2')).toEqual([]);
    expect(service.revoke(issued.id, 'client-2')).rejects.toThrow();
  });
});
