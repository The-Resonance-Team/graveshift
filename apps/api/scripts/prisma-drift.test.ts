import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { migrationOwnershipViolations, normalize, v3DeployViolations } from './prisma-drift';

const migration = join(
  dirname(import.meta.dir),
  'prisma/migrations/20261121052714_init/migration.sql',
);
const v3Migration = join(
  dirname(import.meta.dir),
  'prisma/migrations/20261122120000_v3_releases_deploys/migration.sql',
);
const sql = readFileSync(migration, 'utf8');
const v3Sql = readFileSync(v3Migration, 'utf8');
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

  test('fails when a trigger calls another function', () => {
    const moved = sql.replace(
      'FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();',
      'FOR EACH ROW EXECUTE FUNCTION other_function();',
    );
    expect(moved).not.toBe(sql);
    expect(violations(moved)).toContain('audit_entries_no_update');
    expect(violations(moved)).toContain('other_function');
  });

  test('fails when the audit function body no longer raises append-only', () => {
    const altered = sql.replace("RAISE EXCEPTION 'audit entries are append-only';", 'RETURN NEW;');
    expect(altered).not.toBe(sql);
    expect(violations(altered)).toContain('audit function');
  });

  test('reports a parse failure when the credentials table end is missing', () => {
    const broken = sql.replace(
      '    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")\n);',
      '    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")\n;',
    );
    expect(broken).not.toBe(sql);
    const report = violations(broken);
    expect(report).toContain('cannot parse the end of table "credentials"');
    expect(report).not.toContain('must belong to table "credentials"');
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

describe('v3 deployment migration ownership', () => {
  test('accepts the committed v3 enforcement block', () => {
    expect(v3DeployViolations(v3Sql)).toEqual([]);
  });

  test('fails when a deploy trigger moves to a removed table', () => {
    const moved = v3Sql.replace(
      'BEFORE UPDATE ON "deploys"\nFOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();',
      'BEFORE UPDATE ON "deploy_projects"\nFOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();',
    );
    expect(moved).not.toBe(v3Sql);
    expect(v3DeployViolations(moved).join('\n')).toContain(
      'v3 trigger deploys_no_update targets UPDATE on "deploy_projects"',
    );
    expect(v3DeployViolations(moved).join('\n')).toContain('expected UPDATE on "deploys"');
  });

  test('fails when a removed table returns to the migration', () => {
    const restored = `${v3Sql}\nCREATE TABLE "releases" ("id" TEXT);\n`;
    expect(v3DeployViolations(restored)).toContain(
      'removed v3 object is still present: CREATE TABLE "releases"',
    );
  });

  test('fails when the Project foreign key loses RESTRICT on update', () => {
    const changed = v3Sql.replace(
      'REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;',
      'REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    );
    expect(changed).not.toBe(v3Sql);
    expect(v3DeployViolations(changed).join('\n')).toContain('deploys_project_id_fkey');
  });
});
