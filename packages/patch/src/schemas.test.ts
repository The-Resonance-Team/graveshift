import { describe, expect, test } from 'bun:test';

import { PatchSchema, RepoRulesSchema } from './schemas';

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
