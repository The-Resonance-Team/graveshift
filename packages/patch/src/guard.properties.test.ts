import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { diffStats, guardPatch, PatchRejectedError } from './guard';
import type { Patch, PatchFile, RepoRules } from './schemas';
import { TEST_BASE_SHA, TEST_BLOB_SHA } from './test-constants';

const rules: RepoRules = {
  maxFilesChanged: 5,
  maxLinesChanged: 200,
  allowedPaths: ['src/**'],
  forbiddenPaths: [],
};

const fileAt = (path: string, linesChanged: number, content: string | null): PatchFile => ({
  path,
  content,
  linesChanged,
  baseBlobSha: content === null ? null : TEST_BLOB_SHA,
});

const reasonsOf = (patch: Patch, limits: RepoRules = rules): string[] => {
  try {
    guardPatch(patch, limits);
    return [];
  } catch (error) {
    if (error instanceof PatchRejectedError) return error.reasons;
    throw error;
  }
};

const text = () => fc.string({ maxLength: 60 });
const nullableText = () => fc.oneof(fc.constant(null), text());

describe('guardPatch properties', () => {
  test('under-reporting linesChanged never lowers the counted size', () => {
    fc.assert(
      fc.property(text(), fc.integer({ min: 0, max: 80 }), (content, reported) => {
        const real = diffStats(null, content);
        const under = Math.min(reported, real);
        const patch = (linesChanged: number): Patch => ({
          baseSha: TEST_BASE_SHA,
          files: [fileAt('src/a.ts', linesChanged, content)],
        });
        // A count at or below the real content span cannot raise the total.
        expect(reasonsOf(patch(under), { ...rules, maxLinesChanged: real })).toEqual([]);
        // A count above the real span is counted, so the same cap rejects it.
        expect(reasonsOf(patch(real + 1), { ...rules, maxLinesChanged: real })).toContain(
          `${real + 1} lines exceeds maxLinesChanged ${real}`,
        );
      }),
    );
  });

  test('paths that differ only in case always collide', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]+$/), (name) => {
        const patch: Patch = {
          baseSha: TEST_BASE_SHA,
          files: [fileAt(`src/${name}.ts`, 1, 'a'), fileAt(`src/${name.toUpperCase()}.ts`, 1, 'b')],
        };
        expect(reasonsOf(patch)).toContain(`src/${name.toUpperCase()}.ts: duplicate path`);
      }),
    );
  });

  test('paths built from unsafe segments are always rejected', () => {
    const prefixes = ['/', '../', 'src//', 'src/./', 'src\\', 'src/../'];
    fc.assert(
      fc.property(fc.constantFrom(...prefixes), text(), (prefix, segment) => {
        const path = `${prefix}${segment}`;
        expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [fileAt(path, 1, 'x')] })).toContain(
          `${path}: unsafe path`,
        );
      }),
    );
  });

  test('a deletion never carries a base blob identity', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]+$/), (name) => {
        const patch: Patch = {
          baseSha: TEST_BASE_SHA,
          files: [{ ...fileAt(`src/${name}.ts`, 0, null), baseBlobSha: TEST_BLOB_SHA }],
        };
        expect(reasonsOf(patch)).toContain(
          `src/${name}.ts: baseBlobSha must be null for a deletion`,
        );
      }),
    );
  });
});

describe('diffStats properties', () => {
  test('is symmetric for every pair of texts', () => {
    fc.assert(
      fc.property(nullableText(), nullableText(), (before, after) => {
        expect(diffStats(before, after)).toBe(diffStats(after, before));
      }),
    );
  });

  test('is bounded by the two line counts and zero for equal texts', () => {
    const lines = (value: string | null) => (value === null ? 0 : value.split('\n').length);
    fc.assert(
      fc.property(nullableText(), nullableText(), (before, after) => {
        const count = diffStats(before, after);
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(lines(before) + lines(after));
        if (before === after) expect(count).toBe(0);
      }),
    );
  });
});
