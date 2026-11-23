import { expect, test } from 'bun:test';
import fc from 'fast-check';

import { assertBranchPrefix, BranchError, branchRef } from './branch';
import { publicationText } from './open-pr';
import { diagnosis, fakeClient, file, incident, repo, TEST_BASE_SHA } from './test-helpers';

test('publication keeps long identities with a common prefix distinct and stable', () => {
  const branchFor = (id: string) => {
    const { client } = fakeClient();
    return publicationText({
      client,
      repo,
      patch: { baseSha: TEST_BASE_SHA, files: [file('src/a.ts')] },
      incident: { ...incident, id },
      diagnosis,
      category: 'code_bug',
      dashboardUrl: '',
      headline: 'Null guard: candy price!',
    }).branch;
  };
  const first = 'work-item-with-a-long-common-prefix-one';
  const second = 'work-item-with-a-long-common-prefix-two';
  const branches = [branchFor(first), branchFor(second), branchFor(first)];
  expect(branches[0]).not.toBe(branches[1]);
  expect(branches[0]).toBe(branches[2]);
  expect(branches[0]).toMatch(/^refs\/heads\/graveshift\/inc-[a-f0-9]{32}-null-guard-candy-price$/);
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
