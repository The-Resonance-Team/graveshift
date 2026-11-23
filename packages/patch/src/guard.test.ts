import { describe, expect, test } from 'bun:test';

import { diffStats, guardPatch, PatchRejectedError, unsafePath } from './guard';
import type { Patch, PatchFile, RepoRules } from './schemas';
import { TEST_BASE_SHA, TEST_BLOB_SHA } from './test-constants';

const rules: RepoRules = {
  maxFilesChanged: 5,
  maxLinesChanged: 200,
  allowedPaths: ['src/**', 'config/**', 'test/**'],
  forbiddenPaths: ['.github/**', '**/*.pem', '**/.env*', 'deploy/**', 'policy*.yaml'],
};

const file = (
  path: string,
  linesChanged = 1,
  content: string | null = 'x',
  baseBlobSha: string | null = content === null ? null : TEST_BLOB_SHA,
): PatchFile => ({
  path,
  content,
  linesChanged,
  baseBlobSha,
});

const reasonsOf = (patch: Patch): string[] => {
  try {
    guardPatch(patch, rules);
    return [];
  } catch (error) {
    if (error instanceof PatchRejectedError) return error.reasons;
    throw error;
  }
};

describe('guardPatch', () => {
  test('accepts a valid patch', () => {
    expect(
      reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 10), file('config/app.json')] }),
    ).toEqual([]);
  });

  test('rejects an empty patch', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [] })).toContain('empty patch');
  });

  test('rejects too many files', () => {
    const patch: Patch = {
      baseSha: TEST_BASE_SHA,
      files: Array.from({ length: 6 }, (_unused, index) => file(`src/f${index}.ts`)),
    };
    expect(reasonsOf(patch)).toContain('6 files exceeds maxFilesChanged 5');
  });

  test('accepts the file count at the limit and rejects the next one', () => {
    const atLimit: Patch = {
      baseSha: TEST_BASE_SHA,
      files: Array.from({ length: 5 }, (_unused, index) => file(`src/f${index}.ts`)),
    };
    expect(reasonsOf(atLimit)).toEqual([]);
    expect(
      reasonsOf({ baseSha: TEST_BASE_SHA, files: [...atLimit.files, file('src/f5.ts')] }),
    ).toHaveLength(1);
  });

  test('rejects too many changed lines', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 201)] })).toContain(
      '201 lines exceeds maxLinesChanged 200',
    );
  });

  test('accepts the line count at the limit', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 200)] })).toEqual([]);
  });

  test('rejects an under-reported large file', () => {
    const content = Array.from({ length: 201 }, (_unused, index) => `line ${index}`).join('\n');
    const reasons = reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/big.ts', 1, content)] });
    expect(reasons).toContain('src/big.ts: content exceeds maxLinesChanged 200');
    expect(reasons).toContain('201 lines exceeds maxLinesChanged 200');
  });

  test('counts real content lines toward the total limit', () => {
    const content = Array.from({ length: 101 }, (_unused, index) => `line ${index}`).join('\n');
    const reasons = reasonsOf({
      baseSha: TEST_BASE_SHA,
      files: [file('src/a.ts', 1, content), file('src/b.ts', 1, content)],
    });
    expect(reasons).toContain('202 lines exceeds maxLinesChanged 200');
  });

  test('rejects a negative line count', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts', -1)] })).toContain(
      'src/a.ts: invalid line count',
    );
  });

  test('rejects a non-integer line count', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts', 1.5)] })).toContain(
      'src/a.ts: invalid line count',
    );
  });

  const unsafe = [
    '/etc/passwd',
    'src\\a.ts',
    'src/a\u0000.ts',
    '',
    'src//a.ts',
    'src/./a.ts',
    '../x',
    'src/../x',
    '.',
    '..',
  ];
  for (const [index, path] of unsafe.entries()) {
    test(`rejects unsafe path ${index}`, () => {
      expect(unsafePath(path)).toBe(true);
      expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file(path)] })).toContain(
        `${path}: unsafe path`,
      );
    });
  }

  test('accepts a safe path', () => {
    expect(unsafePath('src/nested/a.ts')).toBe(false);
  });

  test('rejects duplicate paths', () => {
    expect(
      reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts'), file('src/a.ts')] }),
    ).toContain('src/a.ts: duplicate path');
  });

  test('rejects duplicate paths that differ only in case', () => {
    expect(
      reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/A.ts'), file('src/a.ts')] }),
    ).toContain('src/a.ts: duplicate path');
  });

  const forbidden = ['src/.env', 'src/.ENV', 'src/key.PEM', 'deploy/k8s/rbac.yaml', 'policy.yaml'];
  for (const [index, path] of forbidden.entries()) {
    test(`rejects forbidden path ${index}`, () => {
      expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file(path)] })).toContain(
        `${path}: forbidden path`,
      );
    });
  }

  test('rejects a path outside allowedPaths case-sensitively', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('docs/a.md')] })).toContain(
      'docs/a.md: outside allowedPaths',
    );
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('SRC/a.ts')] })).toContain(
      'SRC/a.ts: outside allowedPaths',
    );
  });

  test('accepts a path inside allowedPaths', () => {
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [file('src/a.ts')] })).toEqual([]);
  });

  test('rejects a base SHA that is not a 40-hex git SHA', () => {
    const reasons = reasonsOf({ baseSha: 'base-sha', files: [file('src/a.ts')] });
    expect(reasons).toContain('baseSha must be a 40-hex git SHA');
  });

  test('rejects a deletion that keeps a base blob identity', () => {
    const deleted: PatchFile = { ...file('src/a.ts', 0, null), baseBlobSha: TEST_BLOB_SHA };
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [deleted] })).toContain(
      'src/a.ts: baseBlobSha must be null for a deletion',
    );
  });

  test('rejects a write that drops its base blob identity', () => {
    const written: PatchFile = { ...file('src/a.ts'), baseBlobSha: null };
    expect(reasonsOf({ baseSha: TEST_BASE_SHA, files: [written] })).toContain(
      'src/a.ts: baseBlobSha must be a 40-hex git SHA',
    );
  });

  test('lists every reason in one typed error', () => {
    const patch: Patch = {
      baseSha: TEST_BASE_SHA,
      files: [file('deploy/a.yaml', 300), file('src/../x', -1), file('docs/x.md')],
    };
    const reasons = reasonsOf(patch);
    expect(reasons).toContain('302 lines exceeds maxLinesChanged 200');
    expect(reasons).toContain('deploy/a.yaml: forbidden path');
    expect(reasons).toContain('src/../x: unsafe path');
    expect(reasons).toContain('src/../x: invalid line count');
    expect(reasons).toContain('docs/x.md: outside allowedPaths');
    try {
      guardPatch({ baseSha: TEST_BASE_SHA, files: [] }, rules);
      throw new Error('should reject');
    } catch (error) {
      expect(error).toBeInstanceOf(PatchRejectedError);
      expect((error as PatchRejectedError).code).toBe('PATCH_REJECTED');
    }
  });
});

describe('diffStats', () => {
  test('counts the span between the common prefix and suffix', () => {
    expect(diffStats('a\nb\nc', 'a\nX\nc')).toBe(2);
    expect(diffStats(null, 'a\nb')).toBe(2);
    expect(diffStats('a\nb', null)).toBe(2);
    expect(diffStats('a', 'a')).toBe(0);
  });

  test('is non-negative and the documented upper bound of an equal text is zero', () => {
    const pairs: Array<[string | null, string | null]> = [
      ['a\nb', 'b\na'],
      ['', 'x'],
      ['x', ''],
    ];
    for (const [before, after] of pairs) {
      expect(diffStats(before, after)).toBeGreaterThanOrEqual(0);
    }
    expect(diffStats('same\ntext', 'same\ntext')).toBe(0);
  });
});
