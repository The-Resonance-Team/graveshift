import { describe, expect, test } from 'bun:test';

import { applyUnifiedDiff, lineDiff } from './diff';

const BASE = 'one\ntwo\nthree\nfour\n';

describe('applyUnifiedDiff', () => {
  test('applies a single change hunk', () => {
    const applied = applyUnifiedDiff(BASE, '@@ -2 +2 @@\n-two\n+TWO\n');
    expect(applied).toBe('one\nTWO\nthree\nfour\n');
  });

  test('applies added and removed context hunks with headers and multiple hunks', () => {
    const diff = [
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,2 +1,3 @@',
      ' one',
      '-two',
      '+TWO',
      '+extra',
      '@@ -4 +4 @@',
      '-four',
      '+FOUR',
    ].join('\n');
    expect(applyUnifiedDiff(BASE, diff)).toBe('one\nTWO\nextra\nthree\nFOUR\n');
  });

  test('adds a new file from an empty base', () => {
    expect(applyUnifiedDiff('', '@@ -0,0 +1,2 @@\n+a\n+b\n')).toBe('a\nb\n');
  });

  test('removes every line, leaving an empty file', () => {
    expect(applyUnifiedDiff(BASE, '@@ -1,4 +0,0 @@\n-one\n-two\n-three\n-four\n')).toBe('');
  });

  test('rejects a hunk whose context no longer matches', () => {
    expect(applyUnifiedDiff(BASE, '@@ -1,2 +1,2 @@\n-one\n-TWO\n+2\n')).toBeUndefined();
    expect(
      applyUnifiedDiff('one\nX\nthree\n', '@@ -1,3 +1,3 @@\n one\n-two\n+2\n three\n'),
    ).toBeUndefined();
  });

  test('rejects malformed or unsupported diffs', () => {
    expect(applyUnifiedDiff(BASE, 'no hunks here')).toBeUndefined();
    expect(applyUnifiedDiff(BASE, '@@ -1 +1 @@\n junk\n')).toBeUndefined();
    expect(applyUnifiedDiff(BASE, '@@ -1 +1 @@\n-one\n-two\n')).toBeUndefined();
    expect(
      applyUnifiedDiff(BASE, '@@ -1,2 +1,1 @@\n one\n\\ No newline at end of file\n'),
    ).toBeUndefined();
  });

  test('a base without a trailing newline fails closed', () => {
    expect(applyUnifiedDiff('one', '@@ -1 +1 @@\n-one\n+two\n')).toBeUndefined();
  });

  test('hunks must stay in order and inside the file', () => {
    expect(
      applyUnifiedDiff(BASE, '@@ -4 +4 @@\n-four\n+FOUR\n@@ -1 +1 @@\n-one\n+ONE\n'),
    ).toBeUndefined();
    expect(applyUnifiedDiff(BASE, '@@ -9 +9 @@\n+late\n')).toBeUndefined();
  });
});

describe('lineDiff', () => {
  test('counts real additions and deletions', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual({ additions: 2, deletions: 1 });
    expect(lineDiff('', 'a\n')).toEqual({ additions: 1, deletions: 0 });
    expect(lineDiff('a\n', '')).toEqual({ additions: 0, deletions: 1 });
    expect(lineDiff('same\n', 'same\n')).toEqual({ additions: 0, deletions: 0 });
  });
});
