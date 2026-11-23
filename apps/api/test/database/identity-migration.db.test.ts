import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { PrismaIdentityRepo } from '../../src/identity/repo/identity.repo';
import type { PrismaService } from '../../src/infra/prisma.service';
import { ProjectGrant } from '../../src/internal/project-grant';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

const migrationPath = fileURLToPath(
  new URL('../../prisma/migrations/20261122010000_identity/migration.sql', import.meta.url),
);

// The seven tables that carry a project_id. The migration rewrites every one.
const PROJECT_TABLES = [
  'work_items',
  'fix_attempts',
  'work_commands',
  'hauntings',
  'audit_entries',
  'action_claims',
  'credentials',
] as const;

async function runInOrder(
  statements: string[],
  run: (statement: string) => Promise<unknown>,
): Promise<void> {
  await statements.reduce<Promise<unknown>>((previous, statement) => {
    return previous.then(() => run(statement));
  }, Promise.resolve());
}

function rewriteStatements(): string[] {
  const sql = readFileSync(migrationPath, 'utf8');
  const block =
    /-- BEGIN unmanaged identity data rewrite([\s\S]*?)-- END unmanaged identity data rewrite\./.exec(
      sql,
    )?.[1];
  if (block === undefined) throw new Error('The identity migration data rewrite is missing');
  return block
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Seeds one row per project table for each legacy project id. */
function legacySeeds(id: string): string[] {
  return [
    `INSERT INTO "work_items" ("id","project_id","title","description","success_criteria","subtasks","status","priority","assignee","reporter","labels","team","watchers","severity","service","diagnosis_ref","fix_priority") VALUES ('work-${id}','${id}','Fixture','',ARRAY['ok'],'{}'::jsonb,'todo','medium','fixture','fixture',ARRAY[]::text[],'fixture',ARRAY[]::text[],'warning','fixture','diagnosis',0)`,
    `INSERT INTO "fix_attempts" ("id","project_id","command_id","work_item_id","agent","trigger","state","params","created_at","updated_at") VALUES ('attempt-${id}','${id}','cmd-${id}','work-${id}','fixture','fix_now','completed','{}'::jsonb,now(),now())`,
    `INSERT INTO "work_commands" ("project_id","command_id","work_item_id","actor","kind","request_hash","created_at") VALUES ('${id}','cmd-${id}','work-${id}','fixture','restart','hash-${id}',now())`,
    `INSERT INTO "hauntings" ("project_id","id","service","state","incident","detections","timeline","opened_at","updated_at") VALUES ('${id}','haunt-${id}','fixture','open','{}'::jsonb,'[]'::jsonb,'[]'::jsonb,now(),now())`,
    `INSERT INTO "audit_entries" ("project_id","seq","at","actor","type","payload","prev_hash","hash") VALUES ('${id}',1,now(),'fixture','model.completed','{}'::jsonb,'prev-${id}','hash-${id}')`,
    `INSERT INTO "action_claims" ("project_id","token_id","action_id","request_hash","service","incident_id","state","expires_at") VALUES ('${id}','token-${id}','action-${id}','hash-${id}','fixture','haunt-${id}','completed',now() + interval '1 hour')`,
    `INSERT INTO "credentials" ("id","project_id","kind","name","prefix","hash","client_id","scopes","created_at") VALUES ('cred-${id}','${id}','mcp','fixture','mcp_fixture','hash-${id}','client-${id}',ARRAY['incidents:read'],now())`,
  ];
}

describe.skipIf(!dbTestEnabled)('identity migration data rewrite', () => {
  let db: PrismaService;

  beforeAll(async () => {
    db = await openTestDatabase();
  });

  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  test('migration from local to two numeric ids rewrites all seven tables in one transaction', async () => {
    await resetDatabase(db);
    await db.$executeRawUnsafe('DELETE FROM "projects"');
    await db.$executeRawUnsafe('DELETE FROM "organizations"');
    await db.$executeRawUnsafe('DELETE FROM "daemon_grants"');
    await runInOrder([...legacySeeds('local'), ...legacySeeds('local-2')], (statement) =>
      db.$executeRawUnsafe(statement),
    );

    const statements = rewriteStatements();
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS pg_temp."legacy_project_ids"');
      await runInOrder(statements, (statement) => tx.$executeRawUnsafe(statement));
    });

    const legacyCounts = await Promise.all(
      PROJECT_TABLES.map((table) =>
        db.$queryRawUnsafe<Array<{ count: string }>>(
          `SELECT count(*)::text AS count FROM "${table}" WHERE project_id IN ('local','local-2')`,
        ),
      ),
    );
    for (const legacy of legacyCounts) expect(Number(legacy[0]?.count ?? 0)).toBe(0);
    const numericIds = await db.$queryRawUnsafe<Array<{ project_id: string }>>(
      'SELECT DISTINCT project_id FROM work_items ORDER BY project_id',
    );
    const ids = numericIds.map((row) => row.project_id);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);

    const projects = await db.project.findMany({ orderBy: { projectId: 'asc' } });
    expect(projects.map((project) => project.projectId).sort()).toEqual([...ids].sort());

    // The stored daemon grant must name the migrated Projects so internal
    // routes do not answer 403 for them after the migration.
    const grant = await db.daemonGrant.findUnique({ where: { name: 'default' } });
    expect(grant?.projectIds.sort()).toEqual([...ids].sort());

    // The internal daemon route must be able to reach a migrated Project and
    // must still refuse a Project that is not in the stored grant.
    const grantService = new ProjectGrant(new PrismaIdentityRepo(db));
    const firstId = ids[0];
    if (firstId === undefined) throw new Error('Expected a migrated numeric Project id');
    await expect(grantService.assert(firstId)).resolves.toBeUndefined();
    await expect(grantService.assert('999999')).rejects.toThrow();

    const mappingColumns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'work_items', 'fix_attempts', 'work_commands', 'hauntings',
          'audit_entries', 'action_claims', 'credentials'
        )
        AND (column_name LIKE '%legacy%' OR column_name LIKE '%mapping%')
    `;
    expect(mappingColumns).toHaveLength(0);
    await resetDatabase(db);
  });

  test('a late failure rolls back the whole rewrite and leaves no partial migration', async () => {
    await resetDatabase(db);
    await db.$executeRawUnsafe('DELETE FROM "projects"');
    await db.$executeRawUnsafe('DELETE FROM "organizations"');
    await db.$executeRawUnsafe('DELETE FROM "daemon_grants"');
    await runInOrder(
      [...legacySeeds('atomic-local'), ...legacySeeds('atomic-local-2')],
      (statement) => db.$executeRawUnsafe(statement),
    );

    const statements = rewriteStatements();
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('DROP TABLE IF EXISTS pg_temp."legacy_project_ids"');
        await runInOrder(statements, (statement) => tx.$executeRawUnsafe(statement));
        await tx.$executeRawUnsafe('SELECT 1 / 0');
      }),
    ).rejects.toThrow();

    const remaining = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      "SELECT count(*)::text AS count FROM work_items WHERE project_id IN ('atomic-local','atomic-local-2')",
    );
    expect(Number(remaining[0]?.count ?? 0)).toBe(2);
    const projects = await db.project.count();
    expect(projects).toBe(0);
    await resetDatabase(db);
  });
});
