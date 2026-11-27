import { describe, expect, test } from 'bun:test';

import { PatchSchema, RepoRulesSchema } from './schemas';
import { TEST_BASE_SHA, TEST_BLOB_SHA } from './test-constants';

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
        baseSha: TEST_BASE_SHA,
        files: [{ path: 'src/a.ts', content: null, linesChanged: 1, baseBlobSha: null }],
      }).success,
    ).toBe(true);
    expect(
      PatchSchema.safeParse({
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/a.ts',
            content: 'x',
            linesChanged: 1,
            baseBlobSha: TEST_BLOB_SHA,
            permissions: ['deploy'],
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('requires a non-empty 40-hex base SHA', () => {
    const file = { path: 'src/a.ts', content: 'x', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA };
    const files = 'files';
    expect(PatchSchema.safeParse({ [files]: [file] }).success).toBe(false);
    expect(PatchSchema.safeParse({ baseSha: '', files: [file] }).success).toBe(false);
    expect(PatchSchema.safeParse({ baseSha: 'base-sha', files: [file] }).success).toBe(false);
    expect(
      PatchSchema.safeParse({ baseSha: TEST_BASE_SHA.toUpperCase(), files: [file] }).success,
    ).toBe(false);
    expect(PatchSchema.safeParse({ baseSha: TEST_BASE_SHA, files: [file] }).success).toBe(true);
  });

  test('requires a 40-hex or null base blob SHA', () => {
    const base = { baseSha: TEST_BASE_SHA };
    const path = { path: 'src/a.ts', content: 'x', linesChanged: 1 };
    expect(PatchSchema.safeParse({ ...base, files: [{ ...path }] }).success).toBe(false);
    expect(
      PatchSchema.safeParse({ ...base, files: [{ ...path, baseBlobSha: 'blob-sha' }] }).success,
    ).toBe(false);
    expect(
      PatchSchema.safeParse({ ...base, files: [{ ...path, baseBlobSha: TEST_BLOB_SHA }] }).success,
    ).toBe(true);
    expect(
      PatchSchema.safeParse({
        ...base,
        files: [{ ...path, content: null, baseBlobSha: null }],
      }).success,
    ).toBe(true);
  });
});
