/**
 * Codemod for PR #67: rename hyphenated MCP prompt primitives to snake_case.
 * Run from the repo root. `bun scripts/rename-mcp-primitives.ts --check` only
 * asserts counts. Delete this script when the change merges.
 */
const RENAMES = {
  'triage-incident': 'triage_incident',
  'write-postmortem': 'write_postmortem',
} as const;

type OldName = keyof typeof RENAMES;
type Counts = Record<OldName, number>;

const EXPECTED: ReadonlyArray<{ file: string; counts: Counts }> = [
  { file: 'KIRO_USAGE.md', counts: { 'triage-incident': 1, 'write-postmortem': 1 } },
  {
    file: 'apps/api/test/mcp-compatibility.e2e.test.ts',
    counts: { 'triage-incident': 2, 'write-postmortem': 1 },
  },
  {
    file: 'apps/api/test/mcp-http.e2e.test.ts',
    counts: { 'triage-incident': 1, 'write-postmortem': 0 },
  },
  {
    file: 'apps/api/src/mcp/mcp.prompts.ts',
    counts: { 'triage-incident': 1, 'write-postmortem': 1 },
  },
  {
    file: 'apps/api/src/mcp/mcp-http-scope.guard.ts',
    counts: { 'triage-incident': 1, 'write-postmortem': 1 },
  },
  { file: 'README.md', counts: { 'triage-incident': 1, 'write-postmortem': 1 } },
  {
    file: '.kiro/specs/mcp-server/requirements.md',
    counts: { 'triage-incident': 1, 'write-postmortem': 1 },
  },
];

const checkOnly = process.argv.includes('--check');
const oldNames = Object.keys(RENAMES) as OldName[];

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const originals = await Promise.all(
  EXPECTED.map(async ({ file, counts }) => ({
    file,
    counts,
    text: await Bun.file(file).text(),
  })),
);

const writes: Array<Promise<number>> = [];
for (const { file, counts, text: original } of originals) {
  for (const name of oldNames) {
    const actual = occurrences(original, name);
    const expected = counts[name];
    if (actual !== expected) {
      throw new Error(`${file}: expected ${expected} x ${name}, found ${actual}`);
    }
  }

  if (checkOnly) continue;

  let updated = original;
  for (const [from, to] of Object.entries(RENAMES)) {
    updated = updated.split(from).join(to);
  }
  writes.push(Bun.write(file, updated));
}
await Promise.all(writes);

if (!checkOnly) {
  const after = await Promise.all(
    originals.map(async ({ file }) => ({ file, text: await Bun.file(file).text() })),
  );
  for (const { file, text } of after) {
    for (const name of oldNames) {
      if (text.includes(name)) throw new Error(`${file}: stale ${name} after rename`);
    }
  }
}

process.stdout.write(`${checkOnly ? 'Checked' : 'Renamed'} ${EXPECTED.length} files\n`);
