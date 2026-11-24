import { expect, test } from 'bun:test';

import { createAdmissionFixture } from './admission-fixture';
import type { RequiredAdmission } from './claims';
import { createActuator } from './execute';
import { policy, SECRET, signed, T0 } from './test-helpers';

const ack = async (draft: { key: string }) => ({ key: draft.key });

/** The actuator gets no policy, clock or capacity: the admission adapter owns them. */
function bareActuator(admission: RequiredAdmission) {
  return createActuator({
    secret: SECRET,
    requiredAudit: ack,
    durableAdmission: admission,
    namespace: 'candy-shop',
    docker: { restart: async () => {} },
    kube: { rolloutRestart: async () => {}, scale: async () => {} },
  });
}

test('replay, rate count, eligibility, claim and completion cross one admission seam', async () => {
  const store = createAdmissionFixture(policy, () => T0, ack, { maxTrackedActions: 1 });
  const actuator = bareActuator(store.admission);
  expect((await actuator.execute(signed())).status).toBe('executed');
  expect(await actuator.execute(signed())).toMatchObject({ status: 'denied' });
  expect((await actuator.execute(signed({ tokenId: 't2', service: 'worker' }))).reason).toBe(
    'admission_capacity',
  );
  expect(store.calls.length).toBeGreaterThan(0);
});

test('a late eligibility failure completes the claim with a denied outcome', async () => {
  const pending = Promise.withResolvers<void>();
  let now = T0;
  const store = createAdmissionFixture(
    policy,
    () => now,
    async (draft) => {
      if (draft.type === 'actuator.admitted') await pending.promise;
      return { key: draft.key };
    },
  );
  const actuator = bareActuator(store.admission);
  const outcome = actuator.execute(signed());
  now = T0 + 15 * 60_000;
  pending.resolve();
  expect(await outcome).toMatchObject({ status: 'denied', reason: 'expired' });
  expect(store.calls.at(-1)).toMatchObject({ result: { status: 'denied', reason: 'expired' } });
});
