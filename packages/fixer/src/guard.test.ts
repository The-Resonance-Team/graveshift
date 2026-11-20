import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { assertBranchPrefix, BranchError, branchRef } from './branch';
import { diffStats, guardPatch, PatchRejectedError, unsafePath } from './guard';
import { file, incident, repo } from './test-helpers';
import type { Patch } from './types';

const accepts = (patch: Patch) => {
  try {
    guardPatch(patch, repo);
    return true;
  } catch (error) {
    if (error instanceof PatchRejectedError) return false;
    throw error;
  }
};

const dir = fc.constantFrom(
  'src',
  'config',
  'test',
  'migrations',
  'deploy',
  '.github/workflows',
  'docs',
  'src/nested',
);
const name = fc.constantFrom(
  'a.ts',
  'b.json',
  'key.pem',
  '.env',
  '.env.local',
  'policy.yaml',
  'KEY.PEM',
  '.ENV',
);
const path = fc.tuple(dir, name).map(([d, n]) => `${d}/${n}`);

describe('patch guard properties', () => {
  const forbidden = /^(\.github\/|deploy\/)|\.pem$|\/\.env|^policy.*\.yaml$/i;

  test('a patch is accepted iff every path is allowed, none forbidden, and sizes are within limits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(path, fc.integer({ min: 0, max: 120 })), { maxLength: 8 }),
        (items) => {
          const files = items.map(([p, n]) => file(p, n));
          const unique = new Set(files.map((f) => f.path)).size === files.length;
          const lines = files.reduce((s, f) => s + f.linesChanged, 0);
          const pathsOk = files.every(
            (f) => /^(src|config|test|migrations)\//.test(f.path) && !forbidden.test(f.path),
          );
          const expected =
            files.length > 0 && files.length <= 5 && lines <= 200 && unique && pathsOk;
          expect(accepts({ files })).toBe(expected);
        },
      ),
      { numRuns: 1000 },
    );
  });

  test('any forbidden path rejects the whole patch, whatever else is in it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '.github/workflows/ci.yml',
          'deploy/k8s/rbac.yaml',
          'src/key.pem',
          'src/.env',
          'config/.env.prod',
          'policy.yaml',
          'src/KEY.PEM',
        ),
        fc.nat(3),
        (bad, extra) => {
          const files = [
            file(bad),
            ...Array.from({ length: extra }, (_unused, i) => file(`src/ok${i}.ts`)),
          ];
          expect(accepts({ files })).toBe(false);
        },
      ),
    );
  });

  test('path traversal and odd paths are always rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '../x',
          'src/../../x',
          '/etc/passwd',
          'src//a.ts',
          'src/./a.ts',
          'src\\a.ts',
          'src/a\0.ts',
          '',
        ),
        (bad) => {
          expect(unsafePath(bad)).toBe(true);
          expect(accepts({ files: [file(bad)] })).toBe(false);
        },
      ),
    );
  });

  test('size limits are exact at the boundary', () => {
    expect(accepts({ files: [file('src/a.ts', 200)] })).toBe(true);
    expect(accepts({ files: [file('src/a.ts', 201)] })).toBe(false);
    expect(
      accepts({ files: Array.from({ length: 5 }, (_unused, i) => file(`src/f${i}.ts`, 1)) }),
    ).toBe(true);
    expect(
      accepts({ files: Array.from({ length: 6 }, (_unused, i) => file(`src/f${i}.ts`, 1)) }),
    ).toBe(false);
  });

  test('rejection lists every reason', () => {
    try {
      guardPatch({ files: [file('deploy/a.yaml', 300), file('docs/x.md')] }, repo);
      throw new Error('should reject');
    } catch (error) {
      expect((error as PatchRejectedError).reasons.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('diffStats bounds the real change from above', () => {
    expect(diffStats('a\nb\nc', 'a\nX\nc')).toBe(2);
    expect(diffStats(null, 'a\nb')).toBe(2);
    expect(diffStats('a', 'a')).toBe(0);
    fc.assert(fc.property(fc.string(), (s) => diffStats(s, s) === 0));
  });
});

describe('branch', () => {
  test('uses graveshift/inc-<shortid>-<slug>', () => {
    expect(branchRef(incident.id, 'Null guard: candy price!', 'graveshift/')).toBe(
      'refs/heads/graveshift/inc-inc7f3a9-null-guard-candy-price',
    );
  });

  test('property: refs always stay under the prefix with safe characters', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (id, title) => {
        const ref = branchRef(id, title, 'graveshift/');
        expect(ref).toMatch(/^refs\/heads\/graveshift\/inc-[a-z0-9]+-[a-z0-9-]+$/);
        expect(ref.length).toBeLessThan(100);
        assertBranchPrefix(ref, 'graveshift/');
      }),
    );
    expect(() => assertBranchPrefix('refs/heads/main', 'graveshift/')).toThrow(BranchError);
  });
});
