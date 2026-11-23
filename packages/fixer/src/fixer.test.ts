import type { Patch } from '@graveshift/patch/schemas';
import { describe, expect, test } from 'bun:test';

import { renderPrBody } from './pr-body';
import {
  diagnosis,
  fakeClient,
  incident,
  publishPinned,
  repo,
  TEST_BASE_SHA,
  TEST_BLOB_SHA,
} from './test-helpers';

describe('verified draft publication', () => {
  const patch: Patch = {
    baseSha: TEST_BASE_SHA,
    files: [
      { path: 'src/app.ts', content: 'fixed', linesChanged: 3, baseBlobSha: TEST_BLOB_SHA },
      { path: 'test/app.test.ts', content: 'test', linesChanged: 10, baseBlobSha: TEST_BLOB_SHA },
    ],
  };
  const input = {
    repo,
    patch,
    incident,
    diagnosis,
    category: 'code_bug',
    dashboardUrl: 'https://graveshift.example',
  };

  test('pushes a graveshift/ branch and opens a labelled draft PR', async () => {
    const { client, calls } = fakeClient();
    const pr = await publishPinned({ client, ...input });
    expect(pr.number).toBe(42);
    expect(pr.branch).toMatch(
      /^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-get-candies-id-calls-tofixed-on-a-null-p$/,
    );
    expect(calls.map((c) => c.method)).toEqual([
      'createBlob',
      'createBlob',
      'createTree',
      'createCommit',
      'createRef',
      'createPullRequest',
      'addLabels',
    ]);
    const create = calls.find((c) => c.method === 'createPullRequest');
    expect(create?.args[1]).toMatchObject({ draft: true });
    expect(calls.find((c) => c.method === 'addLabels')?.args[2]).toEqual([
      'graveshift',
      'exorcism',
    ]);
    expect(calls.find((c) => c.method === 'createRef')?.args[1]).toStartWith(
      'refs/heads/graveshift/',
    );
  });

  test('headline drives title, subject and slug while the body keeps the wrapped root cause', async () => {
    const { client, calls } = fakeClient();
    const wrapped = '<untrusted_root_cause>\nhello world\n</untrusted_root_cause>';
    await publishPinned({
      client,
      ...input,
      headline: 'hello world',
      diagnosis: { ...diagnosis, rootCause: wrapped },
    });
    const create = calls.find((c) => c.method === 'createPullRequest');
    const commit = calls.find((c) => c.method === 'createCommit');
    const ref = calls.find((c) => c.method === 'createRef');
    if (create === undefined || commit === undefined || ref === undefined) {
      throw new Error('expected the PR calls');
    }
    expect(create.args[1]).toMatchObject({
      title: 'Exorcism: hello world',
      body: expect.stringContaining(wrapped),
    });
    expect(commit.args[1]).toBe('fix: hello world (incident inc-7f3a9c21-aaaa)');
    expect(ref.args[1]).not.toContain('untrusted');
  });

  test('rejects a service the repo does not cover, before any call', async () => {
    const { client, calls } = fakeClient();
    await expect(
      publishPinned({ client, ...input, incident: { ...incident, service: 'postgres' } }),
    ).rejects.toMatchObject({ code: 'REPO_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  test('the client has no merge method and PR bodies are redacted', () => {
    const { client } = fakeClient();
    expect(Object.keys(client).filter((k) => /merge/i.test(k))).toEqual([]);
    const body = renderPrBody({
      incident,
      diagnosis,
      category: 'code_bug',
      dashboardUrl: 'https://g.example',
      files: ['src/app.ts'],
    });
    expect(body).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(body).toContain('[REDACTED:github_token]');
    expect(body).toContain('https://g.example/incidents/inc-7f3a9c21-aaaa');
    expect(body).toContain('never merged automatically');
  });

  test('an empty dashboard URL adds no broken link to the PR body', () => {
    const body = renderPrBody({
      incident,
      diagnosis,
      category: 'code_bug',
      dashboardUrl: '',
      files: ['src/app.ts'],
    });
    expect(body).not.toContain('/incidents/');
    expect(body).not.toContain('](');
    expect(body).toContain('never merged automatically');
  });
});
