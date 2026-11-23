import { describe, expect, test } from 'bun:test';

import { prepareSource } from './source';
import { sourceClient } from './source.test-helpers';
import { repo, TEST_BASE_SHA } from './test-helpers';

describe('bounded repository source', () => {
  test('reads exact allowed file text and identities without redacting source', async () => {
    const secret = 'DB_PASSWORD=real-file-value\n';
    const { client, calls } = sourceClient({
      'src/app.ts': secret,
      'src/.env': 'never read me',
      'docs/private.md': 'outside allowed paths',
    });
    const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
    expect(snapshot).toMatchObject({
      repo: repo.repo,
      baseBranch: 'main',
      baseSha: TEST_BASE_SHA,
      treeSha: 'tree-sha',
    });
    expect(snapshot.files).toEqual([
      {
        path: 'src/app.ts',
        content: secret,
        mode: '100644',
        blobSha: expect.stringMatching(/^[a-f0-9]{40}$/),
      },
    ]);
    expect(calls.filter((call) => call.method === 'readBlob')).toHaveLength(1);
  });

  test('rejects excessive file counts before reading blobs', async () => {
    const { client, calls } = sourceClient({ 'src/one.ts': 'one', 'src/two.ts': 'two' });
    await expect(
      prepareSource(repo, client, TEST_BASE_SHA, { maxFiles: 1, maxBytes: 100 }),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(calls.filter((call) => call.method === 'readBlob')).toHaveLength(0);
  });

  test('bounds declared and actual bytes without reading further files', async () => {
    const { client, calls, entries } = sourceClient({ 'src/one.ts': '1234', 'src/two.ts': '5678' });
    for (const entry of entries) delete entry.size;
    await expect(
      prepareSource(repo, client, TEST_BASE_SHA, { maxFiles: 2, maxBytes: 3 }),
    ).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
    expect(calls.filter((call) => call.method === 'readBlob')).toHaveLength(1);
  });

  test.each(['120000', '160000'])('refuses source mode %s before a blob read', async (mode) => {
    const { client, calls, entries } = sourceClient();
    const entry = entries[0];
    if (!entry) throw new Error('missing source');
    entry.mode = mode;
    await expect(prepareSource(repo, client, TEST_BASE_SHA)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
    expect(calls.filter((call) => call.method === 'readBlob')).toHaveLength(0);
  });

  test('refuses an underreported or corrupt blob identity', async () => {
    const { client } = sourceClient();
    client.readBlob = async () => 'changed after its hash was recorded';
    await expect(prepareSource(repo, client, TEST_BASE_SHA)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
  });

  test('refuses a base SHA that is not the deployed commit SHA', async () => {
    const { client, calls } = sourceClient();
    await expect(prepareSource(repo, client, 'not-a-sha')).rejects.toMatchObject({
      code: 'STALE_BASE',
    });
    expect(calls).toEqual([]);
  });
});
