import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase, resetDatabase, workItemData } from './fixtures';

const migrationPath = fileURLToPath(
  new URL('../../prisma/migrations/20261122010000_identity/migration.sql', import.meta.url),
);

function rewriteStatements(): string[] {
  const sql = readFileSync(migrationPath, 'utf8');
  const block =
    /-- BEGIN unmanaged identity data rewrite([\s\S]*?)-- END unmanaged identity data rewrite\./.exec(
      sql,
    )?.[1];
  if (block === undefined) throw new Error('The identity migration data rewrite is missing');
  return (
    block
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      // The sequence already exists in a migrated database. The test only needs
      // the rewrite of stored rows.
      .replace(/CREATE SEQUENCE[^;]+;/g, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
  );
}

describe.skipIf(!dbTestEnabled)('identity migration data rewrite', () => {
  let db: PrismaService;

  beforeAll(async () => {
    db = await openTestDatabase();
  });

  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  test('migration from local to two numeric ids rewrites all project rows', async () => {
    await resetDatabase(db);
    await db.workItem.create({ data: workItemData('local', 'legacy-work-1') });
    await db.workItem.create({ data: workItemData('local-2', 'legacy-work-2') });

    // The rewrite order is significant: the foreign keys cascade from work_items.
    await rewriteStatements().reduce<Promise<void>>(async (previous, statement) => {
      await previous;
      await db.$executeRawUnsafe(statement);
    }, Promise.resolve());

    const rows = await db.workItem.findMany({ orderBy: { id: 'asc' } });
    const ids = rows.map((row) => row.projectId);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('local');
    expect(ids).not.toContain('local-2');

    const projects = await db.project.findMany({ orderBy: { projectId: 'asc' } });
    expect(projects.map((project) => project.projectId).sort()).toEqual([...ids].sort());
    expect(projects.every((project) => /^\d+$/.test(project.projectId))).toBe(true);

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
});
