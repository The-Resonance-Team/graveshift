import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import { CREDENTIAL_CONFIG, type AuthConfig, type CredentialRecord } from '../auth.types';

/** The storage seam. Tests supply an in-memory subclass. */
export abstract class CredentialRepo {
  abstract list(): Promise<CredentialRecord[]>;
  abstract findByHash(hash: string): Promise<CredentialRecord | undefined>;
  abstract findById(id: string): Promise<CredentialRecord | undefined>;
  abstract add(record: CredentialRecord): Promise<void>;
  abstract replace(record: CredentialRecord): Promise<void>;
}

/** One JSON file holds every record. The file is created with mode 0600. */
@Injectable()
export class FileCredentialRepo extends CredentialRepo {
  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {
    super();
  }

  async list(): Promise<CredentialRecord[]> {
    return this.read();
  }

  async findByHash(hash: string): Promise<CredentialRecord | undefined> {
    return (await this.read()).find((record) => record.hash === hash);
  }

  async findById(id: string): Promise<CredentialRecord | undefined> {
    return (await this.read()).find((record) => record.id === id);
  }

  async add(record: CredentialRecord): Promise<void> {
    const records = await this.read();
    records.push(record);
    await this.write(records);
  }

  async replace(record: CredentialRecord): Promise<void> {
    const records = await this.read();
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    await this.write(records);
  }

  private async read(): Promise<CredentialRecord[]> {
    try {
      const text = await readFile(this.config.credentialsPath, 'utf8');
      return JSON.parse(text) as CredentialRecord[];
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(records: CredentialRecord[]): Promise<void> {
    const path = this.config.credentialsPath;
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(records, null, 2), { mode: 0o600 });
    await rename(temp, path);
  }
}

// ponytail: one process owns the file; add an exclusive-lock repo if the API runs in more than one process.
