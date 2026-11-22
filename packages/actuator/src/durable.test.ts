import { expect, test } from 'bun:test';

import { createActionHandler } from './handler';
import { runtimeClaim } from './claims';
import { setup, signed, T0 } from './test-helpers';

test('a completed Blessing cannot execute after the actuator is recreated', async () => {
  const first = setup();
  expect((await first.actuator.execute(signed())).status).toBe('executed');
  const restarted = setup(T0, { durableAdmission: first.store.admission });
  const result = await restarted.actuator.execute(signed());
  expect(result).toMatchObject({
    status: 'denied',
    reason: 'already_completed',
    knownResult: { status: 'executed', reason: 'executed' },
  });
  expect(first.calls).toHaveLength(1);
  expect(restarted.calls).toEqual([]);
  expect(first.store.calls).toHaveLength(3);
});

test('two actuator instances share the authoritative per-Grave slot', async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const first = setup(T0, {
    kube: {
      rolloutRestart: async () => {
        started.resolve();
        await pending.promise;
      },
      scale: async () => {},
    },
  });
  const second = setup(T0, { durableAdmission: first.store.admission });
  const executing = first.actuator.execute(signed());
  await started.promise;
  const denied = await second.actuator.execute(signed({ tokenId: 'other' }));
  expect(denied).toMatchObject({ status: 'denied', reason: 'policy_rate_limited' });
  expect(second.calls).toEqual([]);
  pending.resolve();
  expect((await executing).status).toBe('executed');
  first.setNow(T0 + 600_000);
  second.setNow(T0 + 600_000);
  expect((await second.actuator.execute(signed({ tokenId: 'other' }))).status).toBe('executed');
  expect(second.calls).toHaveLength(1);
});

test('different Graves keep separate durable limits across instances', async () => {
  const first = setup();
  const second = setup(T0, { durableAdmission: first.store.admission });
  const results = await Promise.all([
    first.actuator.execute(signed()),
    second.actuator.execute(signed({ tokenId: 'worker-token', service: 'worker' })),
  ]);
  expect(results.map((result) => result.status)).toEqual(['executed', 'executed']);
  expect([...first.calls, ...second.calls]).toHaveLength(2);
});

test('a committed claim with a lost response stays uncertain after a restart', async () => {
  const owner = setup();
  const first = setup(T0, {
    durableAdmission: {
      claim: async (input) => {
        await owner.store.admission.claim(input);
        throw new Error('Bearer lost-response-secret');
      },
      complete: owner.store.admission.complete,
    },
  });
  expect(await first.actuator.execute(signed())).toMatchObject({
    status: 'failed',
    reason: 'admission_unavailable',
  });
  const restarted = setup(T0, { durableAdmission: owner.store.admission });
  const response = await createActionHandler(restarted.actuator)(
    new Request('http://actuator/actions', { method: 'POST', body: JSON.stringify(signed()) }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: 'denied', reason: 'execution_uncertain' });
  expect(first.calls).toEqual([]);
  expect(restarted.calls).toEqual([]);
});

test('a crash after the runtime effect but before completion never permits another effect', async () => {
  const owner = setup();
  const first = setup(T0, {
    durableAdmission: {
      claim: owner.store.admission.claim,
      complete: async () => {
        throw new Error('Bearer process-lost-secret');
      },
    },
  });
  expect(await first.actuator.execute(signed())).toMatchObject({
    status: 'executed',
    auditStatus: 'pending',
  });
  const restarted = setup(T0, { durableAdmission: owner.store.admission });
  expect(await restarted.actuator.execute(signed())).toMatchObject({
    status: 'denied',
    reason: 'execution_uncertain',
  });
  expect(first.calls).toHaveLength(1);
  expect(restarted.calls).toEqual([]);
  expect(owner.store.calls).toHaveLength(2);
});

test('a different token for an already claimed action cannot execute it again', async () => {
  const first = setup();
  await first.actuator.execute(signed());
  const restarted = setup(T0, { durableAdmission: first.store.admission });
  expect(
    await restarted.actuator.execute(signed({ tokenId: 'replacement', actionId: 'act-1' })),
  ).toMatchObject({ reason: 'execution_uncertain' });
  expect(restarted.calls).toEqual([]);
});

test('unfinished durable claims retain capacity after their time window and expiry', async () => {
  const owner = setup();
  expect(await owner.store.admission.claim(runtimeClaim(signed()))).toEqual({ kind: 'claimed' });
  owner.setNow(T0 + 1_200_000);
  const restarted = setup(T0 + 1_200_000, { durableAdmission: owner.store.admission });
  expect(
    await restarted.actuator.execute(signed({ tokenId: 'new', issuedOffset: 1_200_000 })),
  ).toMatchObject({ reason: 'policy_rate_limited' });
  expect(await restarted.actuator.execute(signed({ issuedOffset: 1_200_000 }))).toMatchObject({
    reason: 'execution_uncertain',
  });
  expect(restarted.calls).toEqual([]);
});

test('a known failed effect is retained and never repeated by a new actuator', async () => {
  const first = setup(T0, {
    kube: {
      rolloutRestart: async () => {
        throw new Error('Bearer failed-effect-secret');
      },
      scale: async () => {},
    },
  });
  const failed = await first.actuator.execute(signed());
  const second = setup(T0, { durableAdmission: first.store.admission });
  const result = await second.actuator.execute(signed());
  expect(result).toMatchObject({
    reason: 'already_completed',
    knownResult: { status: 'failed', reason: 'execution_failed' },
  });
  expect(JSON.stringify([failed, result])).not.toContain('failed-effect-secret');
  expect(second.calls).toEqual([]);
});
