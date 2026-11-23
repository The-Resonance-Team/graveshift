import { expect, test } from 'bun:test';

import { publicationText, writeDraft } from './open-pr';
import { createRestClient } from './rest';
import { diagnosis, file, incident, repo, TEST_BASE_SHA } from './test-helpers';

test('the REST adapter opens a draft and has no monitor or merge methods', async () => {
  const seen: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchFn: typeof fetch = Object.assign(
    async (request: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = request instanceof Request ? request.url : String(request);
      seen.push({
        method: init?.method ?? 'GET',
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.includes(`/git/commits/${TEST_BASE_SHA}`))
        return Response.json({ tree: { sha: 't0' } });
      if (url.endsWith('/pulls')) return Response.json({ number: 5, html_url: 'https://x/pull/5' });
      return Response.json({ sha: 's' });
    },
    { preconnect: fetch.preconnect },
  );
  const client = createRestClient({ installationToken: async () => 'tok' }, fetchFn);
  const input = {
    client,
    repo,
    patch: { baseSha: TEST_BASE_SHA, files: [file('src/a.ts')] },
    incident,
    diagnosis,
    category: 'code_bug',
    dashboardUrl: 'https://g',
  };
  const baseTree = await client.getCommitTree(repo.repo, TEST_BASE_SHA);
  await writeDraft(input, publicationText(input), TEST_BASE_SHA, baseTree);
  expect(seen.find((request) => request.url.endsWith('/pulls'))?.body).toMatchObject({
    draft: true,
    base: 'main',
  });
  expect(seen.some((request) => /merge/i.test(request.url) || request.method === 'PUT')).toBe(
    false,
  );
  expect(
    Object.keys(client).filter((method) => /merge|checkrun|getpullrequest/i.test(method)),
  ).toEqual([]);
});
