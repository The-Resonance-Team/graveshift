import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { migrationOwnershipViolations, normalize, v3DeployViolations } from './prisma-drift';

// ponytail: DB-free comparison canonicalises additive migrations; upgrade when a destructive migration lands, after coordinator approval of a CI service container or external test database.
export function canonicalLines(sql: string): string[] {
  const lines: string[] = [];
  let table: string | undefined;

  for (const raw of normalize(sql).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;

    const createTable = /^CREATE TABLE\s+"([^"]+)"\s*\($/i.exec(line);
    if (createTable) {
      table = createTable[1]!;
      lines.push(line);
      continue;
    }

    // The closing parenthesis ends the CREATE TABLE block. Do not label later
    // bare-quoted lines with a table that is no longer in scope.
    if (line === ');') {
      table = undefined;
      lines.push(line);
      continue;
    }

    const addColumn = /^ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+(.+);$/i.exec(line);
    if (addColumn) {
      lines.push(`TABLE ${addColumn[1]} COLUMN ${addColumn[2]!.replace(/,$/, '')}`);
      continue;
    }

    const inlineKey = /^CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s+\((.+)\),?$/i.exec(line);
    if (inlineKey && table) {
      lines.push(`TABLE ${table} UNIQUE_KEY ${inlineKey[1]} (${inlineKey[2]})`);
      continue;
    }

    const index = /^CREATE\s+(UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"\s*\((.+)\);$/i.exec(
      line,
    );
    if (index) {
      const kind = index[1] ? 'UNIQUE_KEY' : 'INDEX';
      lines.push(`TABLE ${index[3]} ${kind} ${index[2]} (${index[4]})`);
      continue;
    }

    // A bare quoted token inside a CREATE TABLE block is a column definition.
    if (table && /^"[^"]+"\s+.+$/.test(line)) {
      lines.push(`TABLE ${table} COLUMN ${line.replace(/,$/, '')}`);
      continue;
    }

    lines.push(line.replace(/,$/, ''));
  }

  return lines.sort();
}

/** Compare migration SQL with generated schema SQL, including table ownership. */
export function driftMatches(migrationSql: string, generatedSql: string): boolean {
  const expected = canonicalLines(migrationSql);
  const actual = canonicalLines(generatedSql);
  return (
    expected.length === actual.length && expected.every((line, index) => line === actual[index])
  );
}

if (import.meta.main) {
  const root = dirname(import.meta.dir);
  const migrationsPath = process.env.GRAVESHIFT_MIGRATIONS_PATH ?? join(root, 'prisma/migrations');
  const migrationFiles = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsPath, entry.name, 'migration.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.error('Prisma drift check failed: no migration.sql files found.');
    process.exit(1);
  }

  const migrationSql = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

  // Keep the PR #97 audit trigger, function body and credentials ownership check.
  const violations = [
    ...migrationOwnershipViolations(migrationSql),
    ...v3DeployViolations(migrationSql),
  ];
  if (violations.length > 0) {
    console.error('Prisma drift check failed: migration objects are on the wrong table.');
    for (const violation of violations) process.stderr.write(`  - ${violation}\n`);
    process.exit(1);
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

  if (!driftMatches(migrationSql, generated.stdout.toString())) {
    console.error('Prisma drift check failed: generated schema SQL differs from migration SQL.');
    process.exit(1);
  }

  process.stdout.write(
    `Prisma drift check passed (${migrationFiles.length} migration file${migrationFiles.length === 1 ? '' : 's'}).\n`,
  );
}
