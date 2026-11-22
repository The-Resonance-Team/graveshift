import { expect, test } from 'bun:test';

import { createRestClient } from './rest';
import { prepareSource } from './source';
import { gitBlob } from './source.test-helpers';
import { repo } from './test-helpers';

function recordingTransport(responses: unknown[]) {
  const requests: Array<{ url: string; method: string }> = [];
  const fetchFn: typeof fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({ url, method: init?.method ?? 'GET' });
      if (responses.length === 0) throw new Error('unexpected GitHub request');
      return Response.json(responses.shift());
    },
    { preconnect: fetch.preconnect },
  );
  return {
    client: createRestClient({ installationToken: async () => 'recorded-test-token' }, fetchFn),
    requests,
  };
}

test('the REST source adapter records encoded ref, tree and blob reads', async () => {
  const content = 'const price = "kẹo";\n';
  const blobSha = gitBlob(content);
  const { client, requests } = recordingTransport([
    { object: { sha: 'base/sha' } },
    { tree: { sha: 'tree/sha' } },
    {
      truncated: false,
      tree: [
        { path: 'src', type: 'tree', sha: 'subtree', mode: '040000' },
        {
          path: 'src/app.ts',
          type: 'blob',
          sha: blobSha,
          mode: '100755',
          size: Buffer.byteLength(content),
        },
        { path: 'src/.env', type: 'blob', sha: 'forbidden', mode: '100644' },
      ],
    },
    {
      sha: blobSha,
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
      size: Buffer.byteLength(content),
    },
  ]);
  const snapshot = await prepareSource(
    { ...repo, repo: 'owner/project name', baseBranch: 'release/fix #1' },
    client,
  );
  expect(snapshot.files).toMatchObject([{ path: 'src/app.ts', mode: '100755', content }]);
  expect(requests).toEqual([
    {
      method: 'GET',
      url: 'https://api.github.com/repos/owner/project%20name/git/ref/heads/release/fix%20%231',
    },
    {
      method: 'GET',
      url: 'https://api.github.com/repos/owner/project%20name/git/commits/base%2Fsha',
    },
    {
      method: 'GET',
      url: 'https://api.github.com/repos/owner/project%20name/git/trees/tree%2Fsha?recursive=1',
    },
    {
      method: 'GET',
      url: `https://api.github.com/repos/owner/project%20name/git/blobs/${blobSha}`,
    },
  ]);
});

test('a truncated tree fails closed without a blob read', async () => {
  const { client, requests } = recordingTransport([
    { object: { sha: 'base' } },
    { tree: { sha: 'tree' } },
    { truncated: true, tree: [] },
  ]);
  await expect(prepareSource(repo, client)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  expect(requests).toHaveLength(3);
});

test('the REST adapter rejects corrupt blob encodings and sizes', async () => {
  const { client } = recordingTransport([
    { sha: 'blob', encoding: 'base64', content: '%%%bad', size: 1 },
  ]);
  await expect(client.readBlob(repo.repo, 'blob')).rejects.toThrow();
});

test('recovery reads a unique open draft on the exact owned head', async () => {
  const branch = 'refs/heads/graveshift/inc-hash-repair';
  const { client, requests } = recordingTransport([
    [
      {
        number: 42,
        html_url: 'https://github.com/owner/project/pull/42',
        draft: true,
        head: {
          ref: 'graveshift/inc-hash-repair',
          sha: 'head-sha',
          repo: { full_name: 'owner/project' },
        },
      },
    ],
    { sha: 'head-sha', parents: [{ sha: 'base-sha' }] },
    { object: { sha: 'head-sha' } },
    [],
  ]);
  expect(await client.getExistingDraft('owner/project', branch, 'base-sha')).toEqual({
    repo: 'owner/project',
    branch,
    number: 42,
    url: 'https://github.com/owner/project/pull/42',
    headSha: 'head-sha',
  });
  expect(new URL(requests[0]?.url ?? '').searchParams.get('head')).toBe(
    'owner:graveshift/inc-hash-repair',
  );
  expect(requests.slice(1)).toEqual([
    { method: 'GET', url: 'https://api.github.com/repos/owner/project/git/commits/head-sha' },
    {
      method: 'GET',
      url: 'https://api.github.com/repos/owner/project/git/ref/heads/graveshift/inc-hash-repair',
    },
  ]);
  expect(await client.getExistingDraft('owner/project', branch, 'base-sha')).toBeUndefined();
});

test.each([
  { draft: false, head: 'graveshift/repair', owner: 'owner/project' },
  { draft: true, head: 'another/branch', owner: 'owner/project' },
  { draft: true, head: 'graveshift/repair', owner: 'another/project' },
])('recovery rejects an incompatible existing pull request: %j', async (existing) => {
  const { client } = recordingTransport([
    [
      {
        number: 42,
        html_url: 'https://github.com/owner/project/pull/42',
        draft: existing.draft,
        head: { ref: existing.head, sha: 'head-sha', repo: { full_name: existing.owner } },
      },
    ],
  ]);
  await expect(
    client.getExistingDraft('owner/project', 'refs/heads/graveshift/repair', 'base-sha'),
  ).rejects.toMatchObject({ code: 'GITHUB_API_ERROR' });
});

test.each([
  { name: 'another base', commit: 'head-sha', parents: ['another-base'], ref: 'head-sha' },
  {
    name: 'a merge commit',
    commit: 'head-sha',
    parents: ['base-sha', 'another-base'],
    ref: 'head-sha',
  },
  { name: 'a root commit', commit: 'head-sha', parents: [], ref: 'head-sha' },
  { name: 'a moved ref', commit: 'head-sha', parents: ['base-sha'], ref: 'different-head' },
  { name: 'a different commit', commit: 'different-head', parents: ['base-sha'], ref: 'head-sha' },
])('recovery rejects $name on the deterministic branch', async ({ commit, parents, ref }) => {
  const { client } = recordingTransport([
    [
      {
        number: 42,
        html_url: 'https://github.com/owner/project/pull/42',
        draft: true,
        head: { ref: 'graveshift/repair', sha: 'head-sha', repo: { full_name: 'owner/project' } },
      },
    ],
    { sha: commit, parents: parents.map((sha) => ({ sha })) },
    { object: { sha: ref } },
  ]);
  await expect(
    client.getExistingDraft('owner/project', 'refs/heads/graveshift/repair', 'base-sha'),
  ).rejects.toMatchObject({
    code: 'GITHUB_API_ERROR',
    message: 'existing draft does not match the recorded base and ref',
  });
});
