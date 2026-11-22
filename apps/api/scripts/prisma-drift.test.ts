import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { migrationOwnershipViolations, normalize } from './prisma-drift';

const migration = join(
  dirname(import.meta.dir),
  'prisma/migrations/20261121052714_init/migration.sql',
);
const sql = readFileSync(migration, 'utf8');
const violations = (text: string) => migrationOwnershipViolations(text).join('\n');

describe('DB-free migration ownership check', () => {
  test('accepts the committed init migration', () => {
    expect(migrationOwnershipViolations(sql)).toEqual([]);
  });

  test('fails when an audit trigger targets the wrong table', () => {
    const moved = sql.replace('BEFORE UPDATE ON "audit_entries"', 'BEFORE UPDATE ON "credentials"');
    expect(moved).not.toBe(sql);
    expect(violations(moved)).toContain('audit_entries_no_update');
    expect(violations(moved)).toContain('credentials');
  });

  test('fails when an audit trigger uses the wrong event', () => {
    const moved = sql.replace(
      'BEFORE DELETE ON "audit_entries"',
      'BEFORE INSERT ON "audit_entries"',
    );
    expect(moved).not.toBe(sql);
    expect(violations(moved)).toContain('audit_entries_no_delete');
  });

  test('fails when expiration_audited_at moves to another table', () => {
    const moved = sql.replace(
      '    "expiration_audited_at" TIMESTAMP(3),\n\n    CONSTRAINT "credentials_pkey"',
      '\n    CONSTRAINT "credentials_pkey"',
    );
    const withMovedColumn = moved.replace(
      '    "severity" "WorkItemSeverity" NOT NULL,',
      '    "severity" "WorkItemSeverity" NOT NULL,\n    "expiration_audited_at" TIMESTAMP(3),',
    );
    expect(violations(withMovedColumn)).toContain('expiration_audited_at');
    expect(violations(withMovedColumn)).toContain('credentials');
  });

  test('fails when credentials_hash_idx moves to another table', () => {
    const moved = sql.replace(
      'CREATE INDEX "credentials_hash_idx" ON "credentials"("hash");',
      'CREATE INDEX "credentials_hash_idx" ON "audit_entries"("hash");',
    );
    expect(moved).not.toBe(sql);
    expect(violations(moved)).toContain('credentials_hash_idx');
    expect(violations(moved)).toContain('credentials');
  });

  test('fails when the audit enforcement block is missing', () => {
    const withoutBlock = normalize(sql);
    expect(withoutBlock).not.toContain('CREATE TRIGGER');
    expect(violations(withoutBlock)).toContain('audit enforcement block');
  });

  test('normalize strips the audit block from the drift comparison', () => {
    expect(normalize(sql)).not.toContain('prevent_audit_entry_mutation');
    expect(normalize(sql)).not.toContain('-- BEGIN unmanaged append-only audit enforcement');
  });
});
