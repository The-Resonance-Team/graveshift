// DB-free validation of the objects that the init migration owns. No database is
// used: the check reads SQL text only, so it can run in CI without a DB service.
const AUDIT_BLOCK =
  /-- BEGIN unmanaged append-only audit enforcement[\s\S]*?-- END unmanaged append-only audit enforcement\./;
const AUDIT_FUNCTION =
  /CREATE FUNCTION\s+([A-Za-z0-9_]+)\s*\(\s*\)\s+RETURNS\s+trigger[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$/;
const TRIGGER =
  /CREATE TRIGGER\s+([A-Za-z0-9_]+)\s+BEFORE\s+([A-Z]+)\s+ON\s+"([^"]+)"[^;]*?FOR EACH ROW\s+EXECUTE (?:FUNCTION|PROCEDURE)\s+([A-Za-z0-9_]+)\s*\(\s*\)\s*;/g;
const APPEND_ONLY_BODY = /RAISE EXCEPTION\s+'[^']*append-only[^']*'/i;
const FUNCTION_NAME = 'prevent_audit_entry_mutation';
const CREDENTIALS_TABLE = /CREATE\s+TABLE\s+"credentials"\s*\(/;

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

/** Reads a table body by balanced parentheses, so Prisma output formatting can change. */
const tableBody = (sql: string, table: string): string | undefined => {
  const match = new RegExp(`CREATE\\s+TABLE\\s+"${table}"\\s*\\(`).exec(sql);
  if (match === null) return undefined;
  const start = match.index + match[0].length;
  let depth = 1;
  let inQuote = false;
  let inString = false;
  for (let index = start; index < sql.length; index += 1) {
    const char = sql[index];
    if (char === undefined) break;
    if (char === "'" && !inQuote) {
      if (inString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (char === '"' && !inString) {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote || inString) continue;
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(start, index);
    }
  }
  return undefined;
};

/**
 * Returns every ownership violation in the migration SQL. An empty list means the
 * append-only enforcement and the objects added in 20186f0 sit on their intended tables.
 */
export function migrationOwnershipViolations(sql: string): string[] {
  const block = AUDIT_BLOCK.exec(sql)?.[0];
  if (block === undefined) return ['audit enforcement block is missing from the migration'];

  const violations: string[] = [];
  const fn = AUDIT_FUNCTION.exec(block);
  if (fn === null) {
    violations.push(`audit function ${FUNCTION_NAME} is missing from the block`);
  } else {
    const [, name, body] = fn;
    if (name !== FUNCTION_NAME) {
      violations.push(`audit function is named "${name}"; expected "${FUNCTION_NAME}"`);
    }
    if (body === undefined || !APPEND_ONLY_BODY.test(body)) {
      violations.push('audit function body no longer raises the append-only exception');
    }
  }

  const triggers = new Map<string, { event: string; table: string; func: string }>();
  for (const match of block.matchAll(TRIGGER)) {
    const [, name, event, table, func] = match;
    if (name === undefined || event === undefined || table === undefined || func === undefined) {
      continue;
    }
    triggers.set(name, { event, table, func });
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
    if (actual.func !== FUNCTION_NAME) {
      violations.push(
        `trigger ${expected.name} calls "${actual.func}"; expected "${FUNCTION_NAME}"`,
      );
    }
  }
  for (const extra of triggers.keys()) {
    violations.push(`unexpected trigger ${extra} in the audit enforcement block`);
  }

  const credentialsBody = tableBody(sql, 'credentials');
  if (credentialsBody === undefined) {
    violations.push(
      CREDENTIALS_TABLE.test(sql)
        ? 'cannot parse the end of table "credentials"; check the CREATE TABLE format'
        : 'table "credentials" is missing from the migration',
    );
  } else if (!/"expiration_audited_at"\s+TIMESTAMP\(3\)/.test(credentialsBody)) {
    violations.push('column expiration_audited_at must belong to table "credentials"');
  }
  if (!/CREATE INDEX\s+"credentials_hash_idx"\s+ON\s+"credentials"\("hash"\);/.test(sql)) {
    violations.push('index credentials_hash_idx must be on "credentials"("hash")');
  }

  return violations;
}
