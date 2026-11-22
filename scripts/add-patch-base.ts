/**
 * Codemod for issue #59: add canonical base identity to patch literals.
 *
 * Usage:
 *   bun scripts/add-patch-base.ts --check
 *   bun scripts/add-patch-base.ts --only packages/patch/src/guard.test.ts,...
 *
 * --check reports the expected and actual occurrence counts per rule and writes
 * nothing. Apply mode asserts every count before it writes any file. The
 * transformation only inserts two fields; it never renames an identifier.
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Rule {
  readonly kind: 'inline' | 'line' | 'field';
  readonly match: string | RegExp;
  readonly insert?: string;
  readonly exclude: RegExp | undefined;
  readonly count: number;
}

interface Target {
  readonly path: string;
  readonly rules: readonly Rule[];
}

const inline = (count: number): Rule => ({
  kind: 'inline',
  match: '{ files:',
  insert: '{ baseSha: TEST_BASE_SHA, files:',
  exclude: undefined,
  count,
});
const line = (count: number, exclude?: RegExp): Rule => ({
  kind: 'line',
  match: /^files:/,
  insert: 'baseSha: TEST_BASE_SHA,',
  exclude,
  count,
});
const field = (count: number): Rule => ({
  kind: 'field',
  match: /linesChanged:\s*[-\d.]+/,
  exclude: undefined,
  count,
});

const targets: readonly Target[] = [
  {
    path: 'packages/patch/src/guard.test.ts',
    rules: [inline(16), line(4), field(0)],
  },
  {
    path: 'packages/patch/src/gateway-composition.test.ts',
    rules: [inline(3), line(1), field(5)],
  },
  {
    path: 'packages/patch/src/generate.test.ts',
    rules: [inline(3), line(2), field(5)],
  },
  {
    path: 'packages/patch/src/schemas.test.ts',
    rules: [inline(0), line(2), field(2)],
  },
  {
    path: 'packages/fixer/src/fixer.test.ts',
    rules: [inline(0), line(1, /^files: \['src\/app\.ts'\]/), field(2)],
  },
  {
    path: 'packages/fixer/src/verified-publication.test.ts',
    rules: [inline(0), line(0), field(1)],
  },
  {
    path: 'packages/fixer/src/verify.test.ts',
    rules: [inline(0), line(1), field(11)],
  },
  {
    path: 'packages/fixer/src/publication.test.ts',
    rules: [inline(13), line(0), field(0)],
  },
  { path: 'packages/fixer/src/branch.test.ts', rules: [inline(1), line(0), field(0)] },
  { path: 'packages/fixer/src/rest.test.ts', rules: [inline(1), line(0), field(0)] },
  {
    path: 'apps/daemon/src/fix-execution.test.ts',
    rules: [inline(0), line(1), field(1)],
  },
  {
    path: 'apps/daemon/src/flow-harness.ts',
    rules: [inline(0), line(0), field(1)],
  },
  {
    path: 'apps/daemon/src/platform.fixture.ts',
    rules: [inline(0), line(1), field(1)],
  },
  // Cross-owner literals are listed so --check shows pending work; this run
  // applies only to the paths passed with --only.
  { path: 'tests/actions-scripts.test.ts', rules: [field(2)] },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex === -1 ? undefined : args[onlyIndex + 1]?.split(',');

if (check && onlyIndex !== -1) throw new Error('use --check or --only, not both');

function fieldMatches(text: string): number[] {
  const pattern = /linesChanged:\s*[-\d.]+/g;
  const offsets: number[] = [];
  for (const match of text.matchAll(pattern)) offsets.push(match.index ?? 0);
  return offsets;
}

function alreadyApplied(text: string, rule: Rule): boolean {
  if (rule.kind === 'inline')
    return (
      text.split('{ baseSha: TEST_BASE_SHA, files:').length - 1 >= rule.count ||
      (rule.count > 0 &&
        text.split('baseSha: TEST_BASE_SHA,').length - 1 >= rule.count &&
        text.split('files:').length - 1 >= rule.count)
    );
  if (rule.kind === 'line')
    return (
      text.split('\n').filter((raw) => raw.trim() === 'baseSha: TEST_BASE_SHA,').length >=
      rule.count
    );
  return text.split('baseBlobSha:').length - 1 >= rule.count;
}

const isBaseLine = (raw: string) => raw.trim() === 'baseSha: TEST_BASE_SHA,';

function occurrences(text: string, rule: Rule): number {
  if (rule.kind === 'inline') {
    const from = String(rule.match);
    return text.split(from).length - 1;
  }
  if (rule.kind === 'field') return fieldMatches(text).length;
  const lines = text.split('\n');
  return lines.filter((raw, index) => {
    const trimmed = raw.trim();
    if (rule.exclude?.test(trimmed)) return false;
    if (index > 0 && isBaseLine(lines[index - 1] ?? '')) return false;
    return typeof rule.match === 'string' ? trimmed === rule.match : rule.match.test(trimmed);
  }).length;
}

function dedupeBaseSha(text: string): string {
  return text
    .split('\n')
    .filter(
      (raw, index, lines) => !(isBaseLine(raw) && index > 0 && isBaseLine(lines[index - 1] ?? '')),
    )
    .join('\n');
}

function rewriteField(text: string): string {
  // Remove a previously misplaced standalone line so the codemod can be rerun.
  const withoutStandalone = text
    .split('\n')
    .filter((raw) => !/^baseBlobSha: (TEST_BLOB_SHA|null),?$/.test(raw.trim()))
    .join('\n');
  return withoutStandalone.replace(/linesChanged:\s*[-\d.]+/g, (match, offset: number) => {
    const after = withoutStandalone.slice(offset + match.length);
    if (after.startsWith(', baseBlobSha:')) return match;
    const lineStart = withoutStandalone.lastIndexOf('\n', offset) + 1;
    const nextBreak = withoutStandalone.indexOf('\n', offset);
    const lineEnd = nextBreak === -1 ? withoutStandalone.length : nextBreak;
    const sourceLine = withoutStandalone.slice(lineStart, lineEnd);
    const value = sourceLine.includes('content: null') ? 'null' : 'TEST_BLOB_SHA';
    return `${match}, baseBlobSha: ${value}`;
  });
}

function rewrite(text: string, rule: Rule): string {
  if (rule.kind === 'inline') {
    const from = String(rule.match);
    if (rule.insert === undefined) throw new Error('inline rule needs insert');
    return text.split(from).join(rule.insert);
  }
  if (rule.kind === 'field') return rewriteField(text);
  const insert = rule.insert ?? '';
  const lines = text.split('\n');
  return lines
    .flatMap((raw, index) => {
      const trimmed = raw.trim();
      if (rule.exclude?.test(trimmed)) return [raw];
      if (index > 0 && isBaseLine(lines[index - 1] ?? '')) return [raw];
      const matched =
        typeof rule.match === 'string' ? trimmed === rule.match : rule.match.test(trimmed);
      if (!matched) return [raw];
      const indent = raw.slice(0, raw.length - raw.trimStart().length);
      return [`${indent}${insert}`, raw];
    })
    .join('\n');
}

let failed = false;
let changed = 0;
for (const target of targets) {
  if (only !== undefined && !only.includes(target.path)) continue;
  let text = readFileSync(target.path, 'utf8');
  const original = text;
  const report: string[] = [];
  for (const rule of target.rules) {
    const actual = occurrences(text, rule);
    if (actual === rule.count) {
      if (!check && rule.count > 0) text = rewrite(text, rule);
      continue;
    }
    if (alreadyApplied(text, rule)) continue;
    failed = true;
    report.push(`${rule.kind} expected ${rule.count}, found ${actual}`);
  }
  if (!check) text = dedupeBaseSha(text);
  const status =
    report.length > 0
      ? `${target.path}: ${report.join(' | ')}`
      : `${target.path}: ${check ? 'ok' : 'updated'}`;
  process.stdout.write(`${status}\n`);
  if (!check && text !== original) {
    writeFileSync(target.path, text);
    changed++;
  }
}

if (failed) {
  console.error('codemod check failed: occurrence counts do not match');
  process.exit(1);
}
process.stdout.write(`${check ? 'check passed' : `updated ${changed} file(s)`}\n`);
