import { describe, expect, test } from 'bun:test';

import type { AuditRepo } from './audit.repo';
import { PostgresAuditSink } from './audit.postgres.sink';
import { currentAuditScope, withAuditScope, type AuditRecord } from './audit.sink';

const record = {
  projectId: '12345',
  key: 'fix:attempt-1:outcome',
  actor: 'client-1',
  type: 'fix.outcome',
  payload: { ok: true },
};

const appended: AuditRecord[] = [];
const repo = {
  append: async (projectId: string, draft: AuditRecord) => {
    appended.push({ ...draft, projectId });
    return { seq: 1 } as never;
  },
} as unknown as AuditRepo;

describe('audit scope binding', () => {
  test('binds one scope per unit of work so a shared collaborator reads the caller of its own request', async () => {
    const seen: (string | undefined)[] = [];
    const first = withAuditScope({ projectId: '12345', actor: 'client-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(currentAuditScope()?.projectId);
    });
    const second = withAuditScope({ projectId: '12346', actor: 'client-2' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(currentAuditScope()?.projectId);
    });
    await Promise.all([first, second]);
    expect(seen.sort()).toEqual(['12345', '12346']);
    expect(currentAuditScope()).toBeUndefined();
  });

  test('a blank scope is not a binding', async () => {
    expect(
      await withAuditScope({ projectId: ' ', actor: 'client-1' }, currentAuditScopeAsync),
    ).toBeUndefined();
    expect(
      await withAuditScope({ projectId: '12345', actor: ' ' }, currentAuditScopeAsync),
    ).toBeUndefined();
  });
});

async function currentAuditScopeAsync(): Promise<ReturnType<typeof currentAuditScope>> {
  return currentAuditScope();
}

describe('postgres audit sink', () => {
  test('is the only writer and appends through the repository that owns the chain', async () => {
    appended.length = 0;
    await new PostgresAuditSink(repo).append(record);
    expect(appended).toEqual([record]);
  });

  test('refuses a record with no authenticated projectId or actor', async () => {
    appended.length = 0;
    const sink = new PostgresAuditSink(repo);
    await expect(sink.append({ ...record, projectId: '' })).rejects.toThrow('authenticated');
    await expect(sink.append({ ...record, projectId: '   ' })).rejects.toThrow('authenticated');
    await expect(sink.append({ ...record, actor: '' })).rejects.toThrow('authenticated');
    expect(appended).toEqual([]);
  });
});
