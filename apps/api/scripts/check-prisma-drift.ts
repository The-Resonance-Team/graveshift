import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { migrationOwnershipViolations, normalize } from './prisma-drift';

// ponytail: DB-free comparison canonicalises additive migrations; upgrade when a destructive migration lands, after coordinator approval of a CI service container or external test database.
const root = dirname(import.meta.dir);
const migrationsPath = join(root, 'prisma/migrations');
const migrationFiles = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(migrationsPath, entry.name, 'migration.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('Prisma drift check failed: no migration.sql files found.');
  process.exit(1);
}

const migrationSql = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

// Ownership of the audit trigger, function and credentials objects stays checked
// after PR #97. Keep one init migration with its recorded checksum.
const violations = migrationOwnershipViolations(migrationSql);
if (violations.length > 0) {
  console.error('Prisma drift check failed: migration objects are on the wrong table.');
  for (const violation of violations) process.stderr.write(`  - ${violation}\n`);
  process.exit(1);
}

// Canonicalise both sides so an ALTER TABLE ADD COLUMN matches an inline column,
// and an inline UNIQUE constraint matches a CREATE UNIQUE INDEX statement.
function canonicalLines(sql: string): string[] {
  return normalize(sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const addColumn = /^ALTER TABLE\s+"[^"]+"\s+ADD COLUMN\s+(.+);$/i.exec(line);
      if (addColumn) return addColumn[1]!.replace(/,$/, '');

      const inlineKey = /^CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s+\((.+)\),?$/i.exec(line);
      if (inlineKey) return `UNIQUE_KEY ${inlineKey[1]} (${inlineKey[2]})`;

      const indexKey = /^CREATE UNIQUE INDEX\s+"([^"]+)"\s+ON\s+"[^"]+"\s*\((.+)\);$/i.exec(line);
      if (indexKey) return `UNIQUE_KEY ${indexKey[1]} (${indexKey[2]})`;

      return line.replace(/,$/, '');
    })
    .sort();
}

const generated = Bun.spawnSync(
  ['bun', 'x', 'prisma', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma', '--script'],
  { cwd: root, stdout: 'pipe', stderr: 'pipe' },
);

if (generated.exitCode !== 0) {
  console.error('Prisma drift check failed: schema SQL generation failed.');
  process.stderr.write(generated.stderr);
  process.exit(generated.exitCode);
}

const expected = canonicalLines(migrationSql);
const actual = canonicalLines(generated.stdout.toString());

if (expected.length !== actual.length || expected.some((line, index) => line !== actual[index])) {
  console.error('Prisma drift check failed: generated schema SQL differs from migration SQL.');
  process.exit(1);
}

process.stdout.write(
  `Prisma drift check passed (${migrationFiles.length} migration file${migrationFiles.length === 1 ? '' : 's'}).\n`,
);
