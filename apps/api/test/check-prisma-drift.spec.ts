import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { canonicalLines, driftMatches } from '../scripts/check-prisma-drift';

const root = dirname(import.meta.dir);
const migrationsPath = join(root, 'prisma/migrations');
const migrationFiles = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(migrationsPath, entry.name, 'migration.sql'))
  .sort();
const migrationSql = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

const generated = Bun.spawnSync(
  ['bun', 'x', 'prisma', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma', '--script'],
  { cwd: root, stdout: 'pipe', stderr: 'pipe' },
);
if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
const generatedSql = generated.stdout.toString();

describe('Prisma drift check', () => {
  test('keeps table ownership for additive columns and indexes', () => {
    const canonical = canonicalLines(migrationSql);
    expect(canonical).toContain('TABLE credentials COLUMN "project_id" TEXT');
    expect(canonical).toContain(
      'TABLE credentials UNIQUE_KEY credentials_tenant_id_project_id_key ("tenant_id", "project_id")',
    );
  });

  test('accepts the committed migration set', () => {
    expect(driftMatches(migrationSql, generatedSql)).toBe(true);
  });

  test('fails when the ALTER TABLE targets the wrong table', () => {
    const mutated = migrationSql.replace(
      'ALTER TABLE "credentials" ADD COLUMN',
      'ALTER TABLE "grave_events" ADD COLUMN',
    );
    expect(mutated).not.toBe(migrationSql);
    expect(driftMatches(mutated, generatedSql)).toBe(false);
  });

  test('fails when the unique index targets the wrong table', () => {
    const mutated = migrationSql.replace(
      'ON "credentials"("tenant_id", "project_id")',
      'ON "tenants"("tenant_id", "project_id")',
    );
    expect(mutated).not.toBe(migrationSql);
    expect(driftMatches(mutated, generatedSql)).toBe(false);
  });

  test('does not label a bare quoted line after a CREATE TABLE block', () => {
    const sql = [
      'CREATE TABLE "grave_events" (',
      '    "id" TEXT NOT NULL',
      ');',
      '"id" TEXT NOT NULL',
    ].join('\n');
    const canonical = canonicalLines(sql);

    expect(canonical).toContain('TABLE grave_events COLUMN "id" TEXT NOT NULL');
    expect(canonical).toContain('"id" TEXT NOT NULL');
  });

  test('CLI check calls the ownership gate on migrations from GRAVESHIFT_MIGRATIONS_PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'graveshift-drift-'));
    const script = join(root, 'scripts/check-prisma-drift.ts');
    const run = () =>
      Bun.spawnSync(['bun', script], {
        cwd: root,
        env: { ...process.env, GRAVESHIFT_MIGRATIONS_PATH: dir },
        stdout: 'pipe',
        stderr: 'pipe',
      });

    try {
      await Promise.all(
        migrationFiles.map(async (file) => {
          const target = join(dir, basename(dirname(file)));
          await mkdir(target, { recursive: true });
          await writeFile(join(target, basename(file)), readFileSync(file, 'utf8'));
        }),
      );
      expect(run().exitCode).toBe(0);

      const initSource = migrationFiles.find((file) => file.includes('_init'))!;
      const initPath = join(dir, basename(dirname(initSource)), basename(initSource));
      const original = readFileSync(initPath, 'utf8');
      const mutated = original.replace(
        'BEFORE UPDATE ON "audit_entries"',
        'BEFORE UPDATE ON "credentials"',
      );
      expect(mutated).not.toBe(original);
      await writeFile(initPath, mutated);

      const blocked = run();
      expect(blocked.exitCode).toBe(1);
      expect(blocked.stderr.toString()).toContain('migration objects are on the wrong table');
      expect(blocked.stderr.toString()).toContain('audit_entries_no_update');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
