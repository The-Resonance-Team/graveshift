import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import type { CredentialRecord } from '../auth.types';
import { FileCredentialRepo } from './credential.repo';

const record: CredentialRecord = {
  id: 'cred-1',
  kind: 'plugin',
  name: 'publisher',
  prefix: 'plugin_abcdef12',
  hash: 'a'.repeat(64),
  clientId: 'client-1',
  tenantId: 'tenant-1',
  scopes: ['events:publish'],
  service: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
};

describe('FileCredentialRepo', () => {
  let dir: string;
  let repo: FileCredentialRepo;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'graveshift-creds-'));
    repo = new FileCredentialRepo({ ...TEST_CONFIG, credentialsPath: join(dir, 'store.json') });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('returns an empty list when no file exists', async () => {
    expect(await repo.list()).toEqual([]);
  });

  test('persists a record with mode 0600', async () => {
    await repo.add(record);
    expect(await repo.list()).toHaveLength(1);
    expect((await repo.findById('cred-1'))?.hash).toBe(record.hash);
    expect((await repo.findById('cred-1'))?.name).toBe('publisher');
    const info = await stat(join(dir, 'store.json'));
    expect(info.mode & 0o777).toBe(0o600);
  });

  test('serializes concurrent writes without losing records', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repo.add({ ...record, id: `cred-${index}`, hash: `${index}`.repeat(64) }),
      ),
    );
    expect(await repo.list()).toHaveLength(8);
  });

  test('rejects an invalid JSON shape', async () => {
    await writeFile(join(dir, 'store.json'), JSON.stringify({ bad: true }));
    expect(repo.list()).rejects.toThrow('invalid shape');
  });

  test('rejects an unknown kind and non-string scopes', async () => {
    const bad = { ...record, kind: 'other' };
    await writeFile(join(dir, 'store.json'), JSON.stringify([bad]));
    expect(repo.list()).rejects.toThrow('invalid shape');
    await writeFile(join(dir, 'store.json'), JSON.stringify([{ ...record, scopes: [3] }]));
    expect(repo.list()).rejects.toThrow('invalid shape');
  });

  test('creates the directory with mode 0700', async () => {
    const nested = join(dir, 'nested', 'store.json');
    const nestedRepo = new FileCredentialRepo({ ...TEST_CONFIG, credentialsPath: nested });
    await nestedRepo.add(record);
    const info = await stat(join(dir, 'nested'));
    expect(info.mode & 0o777).toBe(0o700);
  });

  test('removes the temp file when a write fails', async () => {
    await mkdir(join(dir, 'store.json'));
    expect(repo.add(record)).rejects.toThrow();
    const files = await readdir(dir);
    expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
  });

  test('surfaces a write failure', async () => {
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'not a directory');
    const badRepo = new FileCredentialRepo({
      ...TEST_CONFIG,
      credentialsPath: join(blocker, 'store.json'),
    });
    expect(badRepo.add(record)).rejects.toThrow();
  });

  test('replaces a record in place', async () => {
    await repo.add(record);
    await repo.replace({ ...record, revokedAt: '2026-11-21T10:00:00.000Z' });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.revokedAt).not.toBeNull();
  });
});
