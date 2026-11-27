import { PatchRejectedError } from '@graveshift/patch/guard';
import type { Patch } from '@graveshift/patch/schemas';
import { describe, expect, test } from 'bun:test';

import { BranchError } from './branch';
import {
  diagnosis,
  fakeClient,
  file,
  incident,
  publishPinned,
  repo,
  TEST_BASE_SHA,
} from './test-helpers';

const input = {
  repo,
  patch: { baseSha: TEST_BASE_SHA, files: [file('src/a.ts')] },
  incident,
  diagnosis,
  category: 'code_bug',
  dashboardUrl: 'https://graveshift.example',
};

const content = (lines: number) => Array.from({ length: lines }, () => 'line').join('\n');
const rejected: Array<[string, Patch]> = [
  ['empty patch', { baseSha: TEST_BASE_SHA, files: [] }],
  ['forbidden path', { baseSha: TEST_BASE_SHA, files: [file('src/.ENV')] }],
  ['unsafe path', { baseSha: TEST_BASE_SHA, files: [file('../x')] }],
  ['unallowed path', { baseSha: TEST_BASE_SHA, files: [file('docs/x.md')] }],
  [
    'too many files',
    {
      baseSha: TEST_BASE_SHA,
      files: Array.from({ length: 6 }, (_, index) => file(`src/${index}.ts`)),
    },
  ],
  ['too many lines', { baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 201)] }],
  ['negative line count', { baseSha: TEST_BASE_SHA, files: [file('src/a.ts', -1)] }],
  ['fractional line count', { baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 1.5)] }],
  ['case collision', { baseSha: TEST_BASE_SHA, files: [file('src/A.ts'), file('src/a.ts')] }],
  [
    'underreported file',
    { baseSha: TEST_BASE_SHA, files: [{ ...file('src/a.ts'), content: content(201) }] },
  ],
  [
    'underreported total',
    {
      baseSha: TEST_BASE_SHA,
      files: ['src/a.ts', 'src/b.ts'].map((path) => ({ ...file(path), content: content(101) })),
    },
  ],
];

describe('direct publication safety', () => {
  test.each(rejected)('%s makes zero client calls', async (_name, patch) => {
    const { client, calls } = fakeClient();
    await expect(publishPinned({ client, ...input, patch })).rejects.toBeInstanceOf(
      PatchRejectedError,
    );
    expect(calls).toHaveLength(0);
  });

  test('a stale patch base blocks before any GitHub write', async () => {
    const { client, calls } = fakeClient();
    const stale: Patch = { ...input.patch, baseSha: 'd'.repeat(40) };
    await expect(publishPinned({ client, ...input, patch: stale })).rejects.toMatchObject({
      code: 'STALE_BASE',
    });
    expect(calls.some((call) => call.method.startsWith('create'))).toBe(false);
  });

  test.each([
    '',
    'graveshift/\n',
    'DB_PASSWORD=branch-secret/',
    'graveshift/../',
    'graveshift/.hidden/',
    'graveshift/a.lock/',
  ])('rejects an unsafe branch prefix before any client call: %s', async (branchPrefix) => {
    const { client, calls } = fakeClient();
    await expect(
      publishPinned({ client, ...input, repo: { ...repo, branchPrefix } }),
    ).rejects.toBeInstanceOf(BranchError);
    expect(calls).toHaveLength(0);
  });

  test.each(['explicit headline', 'root cause fallback'])(
    '%s is redacted before title, commit and branch formatting',
    async (source) => {
      const { client, calls } = fakeClient();
      const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const text = `Repair ${secret}\nprice\r\ncheck\0`;
      await publishPinned({
        client,
        ...input,
        ...(source === 'explicit headline' ? { headline: text } : {}),
        incident: { ...incident, id: 'DB_PASSWORD=incident-secret\nextra' },
        diagnosis: { ...diagnosis, rootCause: text },
      });
      const commit = calls.find((call) => call.method === 'createCommit');
      const ref = calls.find((call) => call.method === 'createRef');
      const pull = calls.find((call) => call.method === 'createPullRequest');
      expect(pull?.args[1]).toMatchObject({
        title: 'Exorcism: Repair [REDACTED:github_token] price check',
      });
      expect(commit?.args[1]).toBe(
        'fix: Repair [REDACTED:github_token] price check (incident DB_PASSWORD=[REDACTED:env] extra)',
      );
      expect(ref?.args[1]).toMatch(
        /^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-repair-redacted-github-token-price-check$/,
      );
      const outbound = JSON.stringify(calls);
      expect(outbound.toLowerCase()).not.toContain(secret.toLowerCase());
      expect(outbound).not.toContain('incident-secret');
      expect(outbound).not.toContain('DB_PASSWORD%3Dincident-secret');
    },
  );

  test('redacts every freeform body field without caller preparation', async () => {
    const { client, calls } = fakeClient();
    await publishPinned({
      client,
      ...input,
      headline: 'Repair price',
      repo: { ...repo, services: ['API_TOKEN=service-secret\napi'] },
      incident: { ...incident, service: 'API_TOKEN=service-secret\napi' },
      category: 'API_KEY=category-secret\ncategory',
      diagnosis: {
        ...diagnosis,
        rootCause: 'DB_PASSWORD=root-secret\nsecond line',
        evidence: [{ ref: 'TOKEN=ref-secret\nref', excerpt: 'Bearer evidence-secret' }],
      },
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [file('src/ghp_abcdefghijklmnopqrstuvwxyz0123456789.ts')],
      },
    });
    const pull = calls.find((call) => call.method === 'createPullRequest');
    const body = JSON.stringify(pull?.args[1]);
    for (const secret of [
      'service-secret',
      'category-secret',
      'root-secret',
      'ref-secret',
      'evidence-secret',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    ]) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain('second line');
  });

  test.each([
    'https://user:dashboard-secret@graveshift.example',
    'https://graveshift.example?token=dashboard-secret',
    'https://graveshift.example?token%3Ddashboard-secret',
    'https://graveshift.example/\nDB_PASSWORD=dashboard-secret',
    'javascript:alert(1)',
  ])('omits an unsafe dashboard link: %s', async (dashboardUrl) => {
    const { client, calls } = fakeClient();
    await publishPinned({ client, ...input, dashboardUrl });
    expect(calls.find((call) => call.method === 'createPullRequest')?.args[1]).toMatchObject({
      body: expect.not.stringContaining('[Open the incident in the dashboard]'),
    });
    expect(JSON.stringify(calls)).not.toContain('dashboard-secret');
  });

  test('keeps the created draft reference when optional labels fail', async () => {
    const { client, calls } = fakeClient();
    client.addLabels = async () => {
      throw new Error('labels unavailable');
    };
    const createdPrRef = await publishPinned({ client, ...input });
    expect(createdPrRef).toEqual({
      repo: repo.repo,
      number: 42,
      url: 'https://github.com/xiro/haunted-candy-shop/pull/42',
      branch: expect.stringMatching(/^refs\/heads\/graveshift\//),
      headSha: 'commit-sha',
    });
    expect(calls.filter((call) => call.method === 'createPullRequest')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'createRef')).toHaveLength(1);
  });
});
