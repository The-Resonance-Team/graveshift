import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import { CREDENTIAL_CONFIG, type AuthConfig, type CredentialRecord } from '../auth.types';

/** The storage seam. Tests supply an in-memory subclass. */
export abstract class CredentialRepo {
  abstract list(): Promise<CredentialRecord[]>;
  abstract findById(id: string): Promise<CredentialRecord | undefined>;
  abstract add(record: CredentialRecord): Promise<void>;
  abstract replace(record: CredentialRecord): Promise<void>;
}

function isRecord(value: unknown): value is CredentialRecord {
  if (value === null || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    (item.kind === 'mcp' || item.kind === 'plugin') &&
    typeof item.name === 'string' &&
    typeof item.prefix === 'string' &&
    typeof item.hash === 'string' &&
    typeof item.clientId === 'string' &&
    typeof item.tenantId === 'string' &&
    Array.isArray(item.scopes) &&
    item.scopes.every((scope) => typeof scope === 'string') &&
    (item.service === null || typeof item.service === 'string') &&
    typeof item.createdAt === 'string' &&
    (item.expiresAt === null || typeof item.expiresAt === 'string') &&
    (item.revokedAt === null || typeof item.revokedAt === 'string')
  );
}

/** One JSON file holds every record. The file is created with mode 0600. */
@Injectable()
export class FileCredentialRepo extends CredentialRepo {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {
    super();
  }

  async list(): Promise<CredentialRecord[]> {
    return this.read();
  }

  async findById(id: string): Promise<CredentialRecord | undefined> {
    return (await this.read()).find((record) => record.id === id);
  }

  async add(record: CredentialRecord): Promise<void> {
    await this.serialize(async () => {
      const records = await this.read();
      records.push(record);
      await this.write(records);
    });
  }

  async replace(record: CredentialRecord): Promise<void> {
    await this.serialize(async () => {
      const records = await this.read();
      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = record;
      await this.write(records);
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async read(): Promise<CredentialRecord[]> {
    try {
      const text = await readFile(this.config.credentialsPath, 'utf8');
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
        throw new Error('Credential store has an invalid shape');
      }
      return parsed;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(records: CredentialRecord[]): Promise<void> {
    const path = this.config.credentialsPath;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(records, null, 2), { mode: 0o600 });
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }
}

// Note: the queue serializes writes in one process only. Use a locked store before the API runs in more than one process.
