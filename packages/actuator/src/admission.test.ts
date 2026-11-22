import { expect, test } from 'bun:test';

import { setup, signed, T0 } from './test-helpers';

test('a pending action reserves the only slot before a distinct Blessing can execute', async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const calls: string[] = [];
  const { actuator } = setup(T0, {
    kube: {
      rolloutRestart: async (namespace, service) => {
        calls.push(`${namespace}/${service}`);
        started.resolve();
        await pending.promise;
      },
      scale: async () => {},
    },
  });
  const first = actuator.execute(signed());
  await started.promise;
  const second = await actuator.execute(signed({ tokenId: 'distinct' }));
  expect(calls).toEqual(['candy-shop/api']);
  expect(second).toMatchObject({ status: 'denied', reason: 'policy_rate_limited' });
  pending.resolve();
  expect((await first).status).toBe('executed');
  expect(calls).toEqual(['candy-shop/api']);
});

test('the slot is reserved while its required admission audit is waiting', async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const audits: string[] = [];
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      audits.push(draft.type);
      if (draft.type === 'actuator.admitted') {
        started.resolve();
        await pending.promise;
      }
      return { key: draft.key };
    },
  });
  const first = actuator.execute(signed());
  await started.promise;
  const second = await actuator.execute(signed({ tokenId: 'distinct' }));
  expect(second.reason).toBe('policy_rate_limited');
  expect(calls).toEqual([]);
  expect(audits).toEqual(['actuator.admitted', 'actuator.denied']);
  pending.resolve();
  expect((await first).status).toBe('executed');
  expect(calls).toHaveLength(1);
});

test('policy and capacity denials consume neither their token nor a service slot', async () => {
  const { actuator, calls, setNow } = setup();
  expect((await actuator.execute(signed({ confidence: 0.1 }))).reason).toBe(
    'policy_low_confidence',
  );
  expect((await actuator.execute(signed())).status).toBe('executed');
  expect((await actuator.execute(signed({ tokenId: 'next' }))).reason).toBe('policy_rate_limited');
  setNow(T0 + 10 * 60_000);
  expect((await actuator.execute(signed({ tokenId: 'next' }))).status).toBe('executed');
  expect(calls).toHaveLength(2);
});

test('failed runtime attempts count in the window and cannot reuse their Blessing', async () => {
  const attempts: string[] = [];
  const { actuator, setNow } = setup(T0, {
    kube: {
      rolloutRestart: async (namespace, service) => {
        attempts.push(`${namespace}/${service}`);
        throw new Error('Bearer private-backend-secret');
      },
      scale: async () => {},
    },
  });
  const failed = await actuator.execute(signed());
  expect(failed).toMatchObject({ status: 'failed', reason: 'execution_failed' });
  expect((await actuator.execute(signed())).reason).toBe('replay');
  expect((await actuator.execute(signed({ tokenId: 'next' }))).reason).toBe('policy_rate_limited');
  setNow(T0 + 10 * 60_000);
  expect((await actuator.execute(signed({ tokenId: 'next' }))).status).toBe('failed');
  expect((await actuator.execute(signed())).reason).toBe('replay');
  expect(attempts).toEqual(['candy-shop/api', 'candy-shop/api']);
});

test('the capacity cap never evicts an unexpired consumed token, then prunes expired history', async () => {
  const { actuator, calls, setNow } = setup(T0, { maxTrackedActions: 1 });
  expect((await actuator.execute(signed())).status).toBe('executed');
  setNow(T0 + 10 * 60_000);
  expect((await actuator.execute(signed({ tokenId: 'next', service: 'worker' }))).reason).toBe(
    'admission_capacity',
  );
  expect((await actuator.execute(signed())).reason).toBe('replay');
  setNow(T0 + 15 * 60_000);
  expect((await actuator.execute(signed())).reason).toBe('expired');
  expect(
    (
      await actuator.execute(
        signed({ tokenId: 'next', service: 'worker', issuedOffset: 15 * 60_000 }),
      )
    ).status,
  ).toBe('executed');
  expect(calls).toEqual(['k8s.restart:candy-shop/api', 'k8s.restart:candy-shop/worker']);
});

test('pending executions retain capacity after their token and rate window expire', async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const attempts: string[] = [];
  const { actuator, setNow } = setup(T0, {
    maxTrackedActions: 1,
    kube: {
      rolloutRestart: async (namespace, service) => {
        attempts.push(`${namespace}/${service}`);
        started.resolve();
        await pending.promise;
      },
      scale: async () => {},
    },
  });
  const first = actuator.execute(signed());
  await started.promise;
  setNow(T0 + 20 * 60_000);
  expect(
    (await actuator.execute(signed({ tokenId: 'next', issuedOffset: 20 * 60_000 }))).reason,
  ).toBe('policy_rate_limited');
  expect(
    (
      await actuator.execute(
        signed({ service: 'worker', tokenId: 'worker', issuedOffset: 20 * 60_000 }),
      )
    ).reason,
  ).toBe('admission_capacity');
  pending.resolve();
  expect((await first).status).toBe('executed');
  expect(attempts).toEqual(['candy-shop/api']);
});

test('an approval that expires during its audit wait has no runtime effect', async () => {
  const pending = Promise.withResolvers<void>();
  const { actuator, calls, setNow } = setup(T0, {
    requiredAudit: async (draft) => {
      if (draft.type === 'actuator.admitted') await pending.promise;
      return { key: draft.key };
    },
  });
  const outcome = actuator.execute(signed());
  setNow(T0 + 15 * 60_000);
  pending.resolve();
  expect(await outcome).toMatchObject({ status: 'denied', reason: 'expired' });
  expect(calls).toEqual([]);
});

test('invalid bounded-history capacities fail at construction', () => {
  for (const maxTrackedActions of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => setup(T0, { maxTrackedActions })).toThrow('positive integer');
  }
});
