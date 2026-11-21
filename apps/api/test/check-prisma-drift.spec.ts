import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { canonicalLines, driftMatches } from '../scripts/check-prisma-drift';

const root = dirname(import.meta.dir);
const migrationsPath = join(root, 'prisma/migrations');
const migrationSql = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(migrationsPath, entry.name, 'migration.sql'))
  .sort()
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

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
});
