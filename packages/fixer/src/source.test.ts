import { describe, expect, test } from 'bun:test';

import { createGitHubSourceProvider, SourceError } from './source';
import { fakeClient } from './test-helpers';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

function sourceClient(over: {
  tree?: Array<{ path: string; blobSha: string }>;
  blobs?: Record<string, Uint8Array>;
}) {
  const fake = fakeClient();
  const tree = over.tree ?? [
    { path: 'README.md', blobSha: 'blob-readme' },
    { path: 'src/api.ts', blobSha: 'blob-api' },
  ];
  const blobs: Record<string, Uint8Array> = {
    'blob-readme': text('# shop\n'),
    'blob-api': text('export const price = null;\n'),
    ...over.blobs,
  };
  const client = {
    ...fake.client,
    listTree: async () => {
      fake.calls.push({ method: 'listTree', args: [] });
      return tree;
    },
    getBlobBytes: async (_repo: string, blobSha: string) => {
      fake.calls.push({ method: 'getBlobBytes', args: [blobSha] });
      const bytes = blobs[blobSha];
      if (bytes === undefined) throw new Error(`missing blob ${blobSha}`);
      return bytes;
    },
  };
  return { provider: createGitHubSourceProvider(client), calls: fake.calls };
}

describe('createGitHubSourceProvider', () => {
  test('reads the base ref, tree and every file at the base SHA', async () => {
    const { provider } = sourceClient({});
    const snapshot = await provider.readBase('xiro/haunted-candy-shop', 'main');
    expect(snapshot.baseSha).toBe('base-sha');
    expect(snapshot.treeSha).toBe('base-tree');
    expect(snapshot.files.map((f) => f.path)).toEqual(['README.md', 'src/api.ts']);
    const api = snapshot.files[1]!;
    expect(api.blobSha).toBe('blob-api');
    expect(api.text).toBe('export const price = null;\n');
    expect(new TextDecoder().decode(api.bytes)).toBe('export const price = null;\n');
  });

  test('binary blobs keep exact bytes and carry no text', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);
    const { provider } = sourceClient({
      tree: [{ path: 'assets/x.png', blobSha: 'blob-png' }],
      blobs: { 'blob-png': bytes },
    });
    const snapshot = await provider.readBase('r', 'main');
    expect(snapshot.files[0]?.text).toBeNull();
    expect([...(snapshot.files[0]?.bytes ?? [])]).toEqual([...bytes]);
  });

  test('every read failure throws so the fix fails closed', async () => {
    const broken = fakeClient();
    const provider = createGitHubSourceProvider({
      ...broken.client,
      getBlobBytes: async () => {
        throw new Error('502');
      },
    });
    await expect(provider.readBase('r', 'main')).rejects.toThrow('502');
  });

  test('unsafe, duplicate or oversized tree entries fail closed', async () => {
    await expect(
      sourceClient({
        tree: [{ path: '../escape', blobSha: 'x' }],
        blobs: { x: text('x') },
      }).provider.readBase('r', 'main'),
    ).rejects.toBeInstanceOf(SourceError);
    await expect(
      sourceClient({
        tree: [
          { path: 'a', blobSha: 'x' },
          { path: 'a', blobSha: 'x' },
        ],
        blobs: { x: text('x') },
      }).provider.readBase('r', 'main'),
    ).rejects.toBeInstanceOf(SourceError);
    await expect(
      sourceClient({
        tree: [{ path: 'big.bin', blobSha: 'big' }],
        blobs: { big: new Uint8Array(1_048_577) },
      }).provider.readBase('r', 'main'),
    ).rejects.toBeInstanceOf(SourceError);
  });

  test('currentBaseSha reads the live ref for the stale-base re-check', async () => {
    const { provider, calls } = sourceClient({});
    expect(await provider.currentBaseSha('r', 'main')).toBe('base-sha');
    expect(calls.at(-1)?.method).toBe('getBaseSha');
  });
});
