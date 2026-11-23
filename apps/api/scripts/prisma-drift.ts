// DB-free validation of the objects that the init migration owns. No database is
// used: the check reads SQL text only, so it can run in CI without a DB service.
const AUDIT_BLOCK =
  /-- BEGIN unmanaged append-only audit enforcement[\s\S]*?-- END unmanaged append-only audit enforcement\./;
// Data rewrites change rows, not schema. The drift check compares schema objects
// only, so the identity migration's one-transaction rewrite is excluded here.
const IDENTITY_REWRITE_BLOCK =
  /-- BEGIN unmanaged identity data rewrite[\s\S]*?-- END unmanaged identity data rewrite\./;
const V3_DEPLOY_BLOCK =
  /-- BEGIN unmanaged v3 deploy enforcement[\s\S]*?-- END unmanaged v3 deploy enforcement\./;
const AUDIT_FUNCTION =
  /CREATE FUNCTION\s+([A-Za-z0-9_]+)\s*\(\s*\)\s+RETURNS\s+trigger[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$/;
const TRIGGER =
  /CREATE TRIGGER\s+([A-Za-z0-9_]+)\s+BEFORE\s+([A-Z]+)\s+ON\s+"([^"]+)"[^;]*?FOR EACH ROW(?:\s+WHEN\s*\([^;]*?\))?\s+EXECUTE (?:FUNCTION|PROCEDURE)\s+([A-Za-z0-9_]+)\s*\(\s*\)\s*;/g;
const APPEND_ONLY_BODY = /RAISE EXCEPTION\s+'[^']*append-only[^']*'/i;
const FUNCTION_NAME = 'prevent_audit_entry_mutation';
const CREDENTIALS_TABLE = /CREATE\s+TABLE\s+"credentials"\s*\(/;

const EXPECTED_TRIGGERS = [
  { name: 'audit_entries_no_update', event: 'UPDATE', table: 'audit_entries' },
  { name: 'audit_entries_no_delete', event: 'DELETE', table: 'audit_entries' },
] as const;

/** Strips unmanaged blocks before generated SQL is compared with migration SQL. */
const stripUnmanagedBlocks = (sql: string): string =>
  sql.replace(AUDIT_BLOCK, '').replace(IDENTITY_REWRITE_BLOCK, '').replace(V3_DEPLOY_BLOCK, '');

export const normalize = (sql: string): string =>
  stripUnmanagedBlocks(sql)
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

const V3_TRIGGERS = [
  { name: 'deploys_no_update', event: 'UPDATE', table: 'deploys' },
  { name: 'deploys_no_delete', event: 'DELETE', table: 'deploys' },
  { name: 'deploys_org_consistency', event: 'INSERT', table: 'deploys' },
  { name: 'environments_org_immutable', event: 'UPDATE', table: 'environments' },
  { name: 'projects_org_link_guard', event: 'UPDATE', table: 'projects' },
] as const;

const V3_RESTRICT_CONSTRAINTS = [
  'environments_org_id_fkey',
  'deploys_org_id_fkey',
  'deploys_project_id_fkey',
  'deploys_environment_id_fkey',
] as const;

const REMOVED_V3_OBJECTS = [
  'CREATE TABLE "releases"',
  'CREATE TABLE "project_releases"',
  'CREATE TABLE "deploy_projects"',
  'CREATE TRIGGER releases_org_immutable',
  'CREATE TRIGGER project_releases_org_consistency',
  'CREATE TRIGGER project_releases_project_immutable',
  'CREATE TRIGGER deploy_projects_no_update',
  'CREATE TRIGGER deploy_projects_no_delete',
  'CREATE TRIGGER deploy_projects_org_consistency',
] as const;

/** Checks that the v3 deploy enforcement block sits on its intended tables. */
export function v3DeployViolations(sql: string): string[] {
  const block = V3_DEPLOY_BLOCK.exec(sql)?.[0];
  if (block === undefined) return ['v3 deploy enforcement block is missing from the migration'];
  const violations: string[] = [];
  for (const object of REMOVED_V3_OBJECTS) {
    if (sql.includes(object)) violations.push(`removed v3 object is still present: ${object}`);
  }
  const triggers = new Map<string, { event: string; table: string }>();
  for (const match of block.matchAll(TRIGGER)) {
    const [, name, event, table] = match;
    if (name === undefined || event === undefined || table === undefined) continue;
    triggers.set(name, { event, table });
  }
  for (const expected of V3_TRIGGERS) {
    const actual = triggers.get(expected.name);
    if (actual === undefined) {
      violations.push(`v3 trigger ${expected.name} is missing`);
      continue;
    }
    triggers.delete(expected.name);
    if (actual.event !== expected.event || actual.table !== expected.table) {
      violations.push(
        `v3 trigger ${expected.name} targets ${actual.event} on "${actual.table}"; expected ${expected.event} on "${expected.table}"`,
      );
    }
  }
  for (const extra of triggers.keys()) violations.push(`unexpected v3 trigger ${extra}`);
  for (const constraint of V3_RESTRICT_CONSTRAINTS) {
    const update = constraint === 'deploys_project_id_fkey' ? 'RESTRICT' : 'CASCADE';
    const pattern = new RegExp(
      `ADD CONSTRAINT "${constraint}"[^;]*ON DELETE RESTRICT ON UPDATE ${update};`,
    );
    if (!pattern.test(sql))
      violations.push(`foreign key ${constraint} must use ON DELETE RESTRICT ON UPDATE ${update}`);
  }
  if (
    !/ADD CONSTRAINT "deploys_url_http_check"\s+CHECK \("url" IS NULL OR "url" ~\* '\^https\?:\/\/'\)/.test(
      sql,
    )
  ) {
    violations.push('deploys url CHECK constraint is missing');
  }
  return violations;
}
