import { describe, expect, test } from 'bun:test';

import { GIT_EMPTY_BLOB_SHA, PatchProposalSchema, PatchSchema, RepoRulesSchema } from './schemas';

describe('RepoRulesSchema', () => {
  test('rejects an empty path pattern', () => {
    expect(
      RepoRulesSchema.safeParse({
        maxFilesChanged: 5,
        maxLinesChanged: 200,
        allowedPaths: [''],
      }).success,
    ).toBe(false);
  });

  test('defaults both path lists to empty and rejects an unknown key', () => {
    const parsed = RepoRulesSchema.parse({ maxFilesChanged: 5, maxLinesChanged: 200 });
    expect(parsed.allowedPaths).toEqual([]);
    expect(parsed.forbiddenPaths).toEqual([]);
    expect(
      RepoRulesSchema.safeParse({ maxFilesChanged: 5, maxLinesChanged: 200, extra: true }).success,
    ).toBe(false);
  });
});

describe('PatchSchema', () => {
  test('accepts null content and rejects an extra field', () => {
    expect(
      PatchSchema.safeParse({
        files: [{ path: 'src/a.ts', content: null, linesChanged: 1 }],
      }).success,
    ).toBe(true);
    expect(
      PatchSchema.safeParse({
        files: [{ path: 'src/a.ts', content: 'x', linesChanged: 1, permissions: ['deploy'] }],
      }).success,
    ).toBe(false);
  });
});

describe('PatchProposalSchema', () => {
  const fileBase = { path: 'src/a.ts', baseBlobSha: GIT_EMPTY_BLOB_SHA, linesChanged: 1 };

  test('accepts a diff arm or a content arm pinned to the base', () => {
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ ...fileBase, diff: '@@ -0,0 +1 @@\n+x\n' }],
      }).success,
    ).toBe(true);
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ ...fileBase, content: 'x' }],
      }).success,
    ).toBe(true);
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ ...fileBase, content: null }],
      }).success,
    ).toBe(true);
  });

  test('rejects a missing base SHA, an extra field and both arms', () => {
    expect(PatchProposalSchema.safeParse({ files: [] }).success).toBe(false);
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ ...fileBase, content: 'x', extra: true }],
      }).success,
    ).toBe(false);
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ ...fileBase, content: 'x', diff: 'y' }],
      }).success,
    ).toBe(false);
    expect(
      PatchProposalSchema.safeParse({
        baseSha: 'b',
        files: [{ path: 'src/a.ts', content: 'x', linesChanged: 1 }],
      }).success,
    ).toBe(false);
  });
});
