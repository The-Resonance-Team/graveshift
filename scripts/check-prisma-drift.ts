import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ponytail: DB-free comparison assumes additive migrations; upgrade when a second or destructive migration lands, after coordinator approval of a CI service container or external test database.
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

const normalize = (sql: string) =>
  sql
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== '' && !line.startsWith('--') && line !== 'CREATE SCHEMA IF NOT EXISTS "public";',
    )
    .join('\n');

const generated = Bun.spawnSync(
  ['bun', 'x', 'prisma', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma', '--script'],
  { cwd: root, stdout: 'pipe', stderr: 'pipe' },
);

if (generated.exitCode !== 0) {
  console.error('Prisma drift check failed: schema SQL generation failed.');
  process.stderr.write(generated.stderr);
  process.exit(generated.exitCode);
}

const expected = normalize(migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n'));
const actual = normalize(generated.stdout.toString());

if (actual !== expected) {
  console.error('Prisma drift check failed: generated schema SQL differs from migration SQL.');
  process.exit(1);
}

process.stdout.write(`Prisma drift check passed (${migrationFiles.length} migration file).\n`);
