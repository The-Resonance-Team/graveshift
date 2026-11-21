import type { CredentialRecord } from '../../src/auth/auth.types';
import { CredentialRepo } from '../../src/auth/repo/credential.repo';

/** In-memory store for tests. It reads no file and holds no secret. */
export class FakeCredentialRepo extends CredentialRepo {
  readonly records: CredentialRecord[] = [];

  async list(): Promise<CredentialRecord[]> {
    return [...this.records];
  }

  async findByHash(hash: string): Promise<CredentialRecord | undefined> {
    return this.records.find((record) => record.hash === hash);
  }

  async findById(id: string): Promise<CredentialRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async add(record: CredentialRecord): Promise<void> {
    this.records.push({ ...record });
  }

  async replace(record: CredentialRecord): Promise<void> {
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index >= 0) this.records[index] = { ...record };
  }
}
