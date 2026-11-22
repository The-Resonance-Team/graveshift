import type { CredentialRecord, Principal } from '../../src/auth/auth.types';
import { CredentialLimitError, CredentialRepo } from '../../src/auth/repo/credential.repo';

/** In-memory store for tests. It reads no file and holds no secret. */
export class FakeCredentialRepo extends CredentialRepo {
  readonly records: CredentialRecord[] = [];
  readonly auditEvents: Array<{ actor: string; type: string; payload: Record<string, unknown> }> =
    [];

  async list(principal: Principal): Promise<CredentialRecord[]> {
    return this.records
      .filter(
        (record) =>
          record.clientId === principal.clientId && record.projectId === principal.projectId,
      )
      .map((record) => ({ ...record }));
  }

  async findByHash(hash: string): Promise<CredentialRecord | undefined> {
    return this.records.find((record) => record.hash === hash);
  }

  async add(record: CredentialRecord): Promise<void> {
    const active = this.records.filter(
      (item) =>
        item.clientId === record.clientId &&
        item.projectId === record.projectId &&
        item.revokedAt === null &&
        (item.expiresAt === null || Date.parse(item.expiresAt) > Date.now()),
    ).length;
    if (active >= 10) throw new CredentialLimitError();
    this.records.push({ ...record });
    this.auditEvents.push({
      actor: record.clientId,
      type: 'credential.created',
      payload: { credentialId: record.id, kind: record.kind, name: record.name },
    });
  }

  async revoke(id: string, principal: Principal, at: string): Promise<boolean> {
    const record = this.records.find(
      (item) =>
        item.id === id &&
        item.clientId === principal.clientId &&
        item.projectId === principal.projectId,
    );
    if (!record) return false;
    if (record.revokedAt !== null) return true;
    record.revokedAt = at;
    this.auditEvents.push({
      actor: principal.clientId,
      type: 'credential.revoked',
      payload: { credentialId: id },
    });
    return true;
  }

  async recordExpiry(id: string, at: string): Promise<void> {
    const record = this.records.find((item) => item.id === id);
    if (!record || record.expirationAuditedAt !== null) return;
    record.expirationAuditedAt = at;
    this.auditEvents.push({
      actor: 'system',
      type: 'credential.expired',
      payload: { credentialId: id },
    });
  }
}
