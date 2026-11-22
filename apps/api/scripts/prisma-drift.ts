// DB-free validation of the objects that the init migration owns. No database is
// used: the check reads SQL text only, so it can run in CI without a DB service.
const AUDIT_BLOCK =
  /-- BEGIN unmanaged append-only audit enforcement[\s\S]*?-- END unmanaged append-only audit enforcement\./;
const TABLE_BODY = /CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g;
const TRIGGER = /CREATE TRIGGER\s+([A-Za-z0-9_]+)\s+BEFORE\s+([A-Z]+)\s+ON\s+"([^"]+)"/g;

const EXPECTED_TRIGGERS = [
  { name: 'audit_entries_no_update', event: 'UPDATE', table: 'audit_entries' },
  { name: 'audit_entries_no_delete', event: 'DELETE', table: 'audit_entries' },
] as const;

/** Strips the unmanaged block before generated SQL is compared with migration SQL. */
const stripAuditBlock = (sql: string): string => sql.replace(AUDIT_BLOCK, '');

export const normalize = (sql: string): string =>
  stripAuditBlock(sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== '' && !line.startsWith('--') && line !== 'CREATE SCHEMA IF NOT EXISTS "public";',
    )
    .join('\n');

/**
 * Returns every ownership violation in the migration SQL. An empty list means the
 * append-only enforcement and the objects added in 20186f0 sit on their intended tables.
 */
export function migrationOwnershipViolations(sql: string): string[] {
  const block = AUDIT_BLOCK.exec(sql)?.[0];
  if (block === undefined) return ['audit enforcement block is missing from the migration'];

  const violations: string[] = [];
  if (!/CREATE FUNCTION prevent_audit_entry_mutation\(\) RETURNS trigger/.test(block)) {
    violations.push('audit function prevent_audit_entry_mutation is missing from the block');
  }

  const triggers = new Map<string, { event: string; table: string }>();
  for (const match of block.matchAll(TRIGGER)) {
    const [, name, event, table] = match;
    if (name === undefined || event === undefined || table === undefined) continue;
    triggers.set(name, { event, table });
  }
  for (const expected of EXPECTED_TRIGGERS) {
    const actual = triggers.get(expected.name);
    if (actual === undefined) {
      violations.push(`trigger ${expected.name} is missing from the audit enforcement block`);
      continue;
    }
    triggers.delete(expected.name);
    if (actual.table !== expected.table) {
      violations.push(
        `trigger ${expected.name} targets "${actual.table}"; expected "${expected.table}"`,
      );
    }
    if (actual.event !== expected.event) {
      violations.push(
        `trigger ${expected.name} fires on ${actual.event}; expected ${expected.event}`,
      );
    }
  }
  for (const extra of triggers.keys()) {
    violations.push(`unexpected trigger ${extra} in the audit enforcement block`);
  }

  const credentials = new Map<string, string>();
  for (const match of sql.matchAll(TABLE_BODY)) {
    const [, name, body] = match;
    if (name === undefined || body === undefined) continue;
    credentials.set(name, body);
  }
  const credentialsBody = credentials.get('credentials');
  if (credentialsBody === undefined) {
    violations.push('table "credentials" is missing from the migration');
  } else if (!/"expiration_audited_at"\s+TIMESTAMP\(3\)/.test(credentialsBody)) {
    violations.push('column expiration_audited_at must belong to table "credentials"');
  }
  if (!/CREATE INDEX\s+"credentials_hash_idx"\s+ON\s+"credentials"\("hash"\);/.test(sql)) {
    violations.push('index credentials_hash_idx must be on "credentials"("hash")');
  }

  return violations;
}
