import { describe, expect, test } from 'bun:test';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { FakeCredentialRepo } from '../../../test/fakes/fake-credential-repo';
import { CreateCredentialDto } from '../dto/create-credential.dto';
import type { Principal } from '../auth.types';
import { CredentialService } from './credential.service';

const principal: Principal = {
  clientId: 'client-1',
  projectId: 'project-1',
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
    expect(issued.value).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.records[0]?.hash).not.toContain(issued.value);
    expect(repo.records[0]).not.toHaveProperty('value');
    expect(repo.records[0]?.prefix).toBe(issued.prefix);
  });

  test('verifies a presented value and returns the principal', async () => {
    const { service } = setup();
    const issued = await service.issue(dto(), principal);
    const verified = await service.verify(issued.value);
    expect(verified.clientId).toBe('client-1');
    expect(verified.projectId).toBe('project-1');
    expect(verified.kind).toBe('mcp');
  });

  test('refuses an unknown value and a value for another kind', async () => {
    const { service } = setup();
    const mcp = await service.issue(dto(), principal);
    await expect(service.verify('x'.repeat(32))).rejects.toThrow();
    await expect(service.verify(mcp.value, 'plugin')).rejects.toThrow();
  });

  test('refuses a revoked or expired credential', async () => {
    const { repo, service } = setup();
    const issued = await service.issue(dto(), principal);
    await service.revoke(issued.id, principal);
    await expect(service.verify(issued.value)).rejects.toThrow();

    const second = await service.issue(dto({ name: 'old' }), principal);
    const record = repo.records.find((item) => item.id === second.id);
    if (record) record.expiresAt = '2020-01-01T00:00:00.000Z';
    await expect(service.verify(second.value)).rejects.toThrow();
    expect(repo.auditEvents.filter((event) => event.type === 'credential.expired')).toHaveLength(1);
    await expect(service.verify(second.value)).rejects.toThrow();
    expect(repo.auditEvents.filter((event) => event.type === 'credential.expired')).toHaveLength(1);
  });

  test('enforces the scope catalog and the client holdings', async () => {
    const { service } = setup();
    await expect(service.issue(dto({ scopes: ['tokens:manage'] }), principal)).rejects.toThrow();
    await expect(service.issue(dto({ scopes: ['events:publish'] }), principal)).rejects.toThrow();
    await expect(service.issue(dto({ scopes: ['audit:read'] }), principal)).rejects.toThrow();
    expect(
      service.issue(dto({ kind: 'plugin', scopes: ['events:publish'], service: 'api' }), principal),
    ).resolves.toBeDefined();
  });

  test('issues a publish-only credential bound to a Sentry project and Grave', async () => {
    const { service, repo } = setup();
    const sentryPrincipal: Principal = { ...principal, projectId: '12345' };
    const issued = await service.issue(
      dto({ kind: 'plugin', name: 'sentry', scopes: ['events:publish'], service: 'api' }),
      sentryPrincipal,
    );

    expect(issued.value).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.service).toBe('api');
    expect(issued).not.toHaveProperty('projectId');
    expect(repo.records[0]?.projectId).toBe('12345');
    expect((await service.verify(issued.value, 'plugin')).projectId).toBe('12345');
    await expect(
      service.issue(
        dto({
          kind: 'plugin',
          name: 'sentry-reader',
          scopes: ['events:publish', 'incidents:read'],
          service: 'api',
        }),
        sentryPrincipal,
      ),
    ).rejects.toThrow();
  });

  test('caps parallel issues at ten active credentials', async () => {
    const { service } = setup();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        service.issue(dto({ name: `key-${index}` }), principal),
      ),
    );
    const ok = results.filter((result) => result.status === 'fulfilled');
    const conflicts = results.filter(
      (result) =>
        result.status === 'rejected' && (result.reason as { status?: number }).status === 409,
    );
    expect(ok).toHaveLength(10);
    expect(conflicts).toHaveLength(10);
  });

  test('lists metadata and revokes only own credentials', async () => {
    const { repo, service } = setup();
    const issued = await service.issue(dto(), principal);
    const list = await service.list(principal);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('value');
    expect(list[0]).not.toHaveProperty('hash');
    expect(repo.auditEvents.map((event) => event.type)).toContain('credential.created');
    expect(
      await service.list({ ...principal, clientId: 'client-2', projectId: 'project-2' }),
    ).toEqual([]);
    await expect(
      service.revoke(issued.id, { ...principal, clientId: 'client-2' }),
    ).rejects.toThrow();
    await service.revoke(issued.id, principal);
    expect(repo.auditEvents.map((event) => event.type)).toContain('credential.revoked');
  });
});
