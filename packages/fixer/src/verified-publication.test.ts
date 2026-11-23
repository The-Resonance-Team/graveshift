import { expect, test } from 'bun:test';
import { z } from 'zod';

import type { PublicationPhase } from './faults';
import { prepareSource } from './source';
import { gitBlob, gitRunner, sourceClient } from './source.test-helpers';
import { diagnosis, incident, repo, TEST_BASE_SHA } from './test-helpers';
import { planPublication, publishVerified, recoverPublication } from './verified-publication';
import { verifyPatch } from './verify';

async function fixture(content = 'const price = 0;\n', baseSha = TEST_BASE_SHA) {
  const { client, calls, entries } = sourceClient();
  const snapshot = await prepareSource(repo, client, baseSha);
  const verified = await verifyPatch({
    snapshot,
    patch: {
      baseSha,
      files: [
        {
          path: 'src/app.ts',
          content,
          linesChanged: 0,
          baseBlobSha: gitBlob('const price = null;\n'),
        },
      ],
    },
    commands: [['git', 'diff', '--check']],
    timeoutMs: 10_000,
    runner: gitRunner,
  });
  const input = {
    client,
    repo,
    snapshot,
    verified,
    incident,
    diagnosis,
    category: 'code_bug',
    dashboardUrl: '',
    headline: 'Repair null price',
  };
  calls.length = 0;
  return { input, calls, entries };
}

test('plans the publication without effects and publishes a checked draft against the pinned base', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  expect(calls).toHaveLength(0);
  expect(plan).toEqual({
    repo: repo.repo,
    baseSha: input.snapshot.baseSha,
    branch: expect.stringMatching(/^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-repair-null-price$/),
  });
  const reference = await publishVerified({ ...input, plan });
  expect(reference.number).toBe(42);
  expect(calls.map((call) => call.method)).toEqual([
    'getExistingDraft',
    'createBlob',
    'createTree',
    'createCommit',
    'createRef',
    'createPullRequest',
    'addLabels',
  ]);
  expect(calls.find((call) => call.method === 'createTree')?.args[1]).toBe(input.snapshot.treeSha);
  expect(calls.find((call) => call.method === 'createCommit')?.args[3]).toBe(
    input.snapshot.baseSha,
  );
  // Parse the recorded call instead of using an asymmetric matcher: Bun 1.4.4
  // mutates the received object when toMatchObject holds a stringContaining.
  const draftInput = z
    .object({ draft: z.literal(true), body: z.string() })
    .parse(calls.find((call) => call.method === 'createPullRequest')?.args[1]);
  expect(draftInput.body).toContain('Passed: `git diff --check`');
  expect(draftInput.body).toContain('+1 / -1');
});

test('a changed base SHA after verification fails before the first GitHub write', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  const tampered = {
    ...input,
    snapshot: { ...input.snapshot, baseSha: 'b'.repeat(40) },
  };
  await expect(publishVerified({ ...tampered, plan })).rejects.toMatchObject({
    code: 'STALE_BASE',
  });
  expect(calls.some((call) => call.method.startsWith('create'))).toBe(false);
});

test('publication never re-reads the branch HEAD after source verification', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  input.client.getBaseSha = async () => {
    throw new Error('the branch HEAD must not be read again');
  };
  expect((await publishVerified({ ...input, plan })).number).toBe(42);
  expect(calls.some((call) => call.method === 'getBaseSha')).toBe(false);
});

test('recovery returns the known draft without checking a newer base or writing again', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  const reference = {
    repo: repo.repo,
    branch: plan.branch,
    number: 73,
    headSha: 'published-sha',
    url: 'https://github.com/xiro/haunted-candy-shop/pull/73',
  };
  input.client.getExistingDraft = async (repository, branch, baseSha) => {
    expect({ repository, branch, baseSha }).toEqual({
      repository: plan.repo,
      branch: plan.branch,
      baseSha: plan.baseSha,
    });
    return reference;
  };
  input.client.getBaseSha = async () => {
    throw new Error('must not recheck an already published draft');
  };
  expect(await recoverPublication(input.client, plan)).toEqual(reference);
  expect(await publishVerified({ ...input, plan })).toEqual(reference);
  expect(calls).toHaveLength(0);
});

test('a failed optional label preserves the verified draft reference', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  input.client.addLabels = async () => {
    throw new Error('TOKEN=private-label-failure');
  };
  expect(await publishVerified({ ...input, plan })).toMatchObject({
    number: 42,
    branch: plan.branch,
  });
  expect(calls.filter((call) => call.method === 'createPullRequest')).toHaveLength(1);
});

test.each<PublicationPhase>(['branch', 'draft'])(
  'a lost %s response is uncertain and contains no transport secret',
  async (phase) => {
    const { input } = await fixture();
    const plan = planPublication(input);
    const fail = async () => {
      throw new Error('TOKEN=private-publication-response');
    };
    if (phase === 'branch') input.client.createRef = fail;
    else input.client.createPullRequest = fail;
    await expect(publishVerified({ ...input, plan })).rejects.toMatchObject({
      code: 'PUBLICATION_FAILED',
      phase,
      uncertain: true,
      message: `draft publication failed during ${phase}`,
    });
  },
);

test('failed reconciliation is uncertain and prevents all new writes', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  input.client.getExistingDraft = async () => {
    throw new Error('TOKEN=private-recovery');
  };
  await expect(publishVerified({ ...input, plan })).rejects.toMatchObject({
    code: 'PUBLICATION_FAILED',
    phase: 'recovery',
    uncertain: true,
  });
  expect(calls).toHaveLength(0);
});

test('a changed intent or verification result fails before any client call', async () => {
  const { input, calls } = await fixture();
  const plan = planPublication(input);
  await expect(
    publishVerified({ ...input, plan: { ...plan, baseSha: 'wrong-base' } }),
  ).rejects.toMatchObject({ code: 'STALE_BASE' });
  const file = input.verified.patch.files[0];
  if (!file) throw new Error('missing patch');
  file.content = 'unverified change\n';
  await expect(publishVerified({ ...input, plan })).rejects.toMatchObject({ code: 'CHECK_FAILED' });
  expect(calls).toHaveLength(0);
});

test('verified branches distinguish proposals and bases for the same incident and headline', async () => {
  const [first, repeat, differentPatch, differentBase] = await Promise.all([
    fixture(),
    fixture(),
    fixture('const price = 1;\n'),
    fixture('const price = 0;\n', 'c'.repeat(40)),
  ]);
  const plans = [first, repeat, differentPatch, differentBase].map(({ input }) =>
    planPublication(input),
  );
  expect(plans[0]?.branch).toBe(plans[1]?.branch);
  expect(new Set(plans.map((plan) => plan.branch)).size).toBe(3);
  expect(
    [first, repeat, differentPatch, differentBase].every(({ calls }) => calls.length === 0),
  ).toBe(true);
});
