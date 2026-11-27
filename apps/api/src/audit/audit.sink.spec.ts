import { describe, expect, test } from 'bun:test';

import { currentAuditScope, withAuditScope } from './audit.sink';

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
