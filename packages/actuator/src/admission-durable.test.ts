import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { createDurableAdmission } from './admission-durable';
import { policy, setup, signed, T0 } from './test-helpers';

test('a restart does not allow the same approval token to run twice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  const path = join(dir, 'admission.db');
  try {
    const requiredAudit = async (draft: { key: string }) => ({ key: draft.key });
    const first = setup(T0, {
      durableAdmission: createDurableAdmission(path, policy, () => T0, requiredAudit),
    });
    expect((await first.actuator.execute(signed())).status).toBe('executed');

    // A new process opens the same file. The consumed token is still present.
    const restarted = setup(T0, {
      durableAdmission: createDurableAdmission(path, policy, () => T0, requiredAudit),
    });
    const result = await restarted.actuator.execute(signed());
    expect(result).toMatchObject({
      status: 'denied',
      reason: 'already_completed',
      knownResult: { status: 'executed', reason: 'executed' },
    });
    expect(restarted.calls).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unopenable admission store path throws at construction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  try {
    // A directory is not a SQLite file. Startup must fail here, not at first action.
    expect(() =>
      createDurableAdmission(
        dir,
        policy,
        () => T0,
        async (draft) => ({ key: draft.key }),
      ),
    ).toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
