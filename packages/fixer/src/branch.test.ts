import { expect, test } from 'bun:test';
import fc from 'fast-check';

import { assertBranchPrefix, BranchError, branchRef } from './branch';
import { diagnosis, fakeClient, file, incident, repo, TEST_BASE_SHA } from './test-helpers';
import { openDraftPr } from './open-pr';

test('direct publication keeps long identities with a common prefix distinct and stable', async () => {
  const publish = async (id: string) => {
    const { client } = fakeClient();
    return openDraftPr({
      client,
      repo,
      patch: { baseSha: TEST_BASE_SHA, files: [file('src/a.ts')] },
      incident: { ...incident, id },
      diagnosis,
      category: 'code_bug',
      dashboardUrl: '',
      headline: 'Null guard: candy price!',
    });
  };
  const first = 'work-item-with-a-long-common-prefix-one';
  const second = 'work-item-with-a-long-common-prefix-two';
  const refs = await Promise.all([publish(first), publish(second), publish(first)]);
  expect(refs[0]?.branch).not.toBe(refs[1]?.branch);
  expect(refs[0]?.branch).toBe(refs[2]?.branch);
  expect(refs[0]?.branch).toMatch(
    /^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-null-guard-candy-price$/,
  );
});

test('identity uses the full original value, including case and punctuation', () => {
  const refs = ['work-item', 'workitem', 'WORKITEM'].map((id) =>
    branchRef(id, 'Repair price', 'graveshift/'),
  );
  expect(new Set(refs).size).toBe(3);
});

test('handles long hyphen runs without regex backtracking', () => {
  expect(branchRef('inc7', '-'.repeat(500), 'graveshift/')).toMatch(
    /^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-fix$/,
  );
});

test('property: refs stay under the prefix with safe characters', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (id, title) => {
      const ref = branchRef(id, title, 'graveshift/');
      expect(ref).toMatch(/^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-[a-z0-9-]+$/);
      expect(ref.length).toBeLessThan(100);
      assertBranchPrefix(ref, 'graveshift/');
    }),
  );
  expect(() => assertBranchPrefix('refs/heads/main', 'graveshift/')).toThrow(BranchError);
});
