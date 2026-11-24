import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { iso, policy, SECRET, setup, signed, T0, unsigned } from './test-helpers';
import { signRequest, verifyHmac } from './sign';
import { createActuator } from './execute';
import { createAdmissionFixture } from './admission-fixture';
import type { ActionRequest } from './types';

describe('decisions', () => {
  test('approved: k8s rollout restart, docker restart and bounded scale run', async () => {
    const { actuator, calls, setNow } = setup();
    const approved = await actuator.execute(signed());
    expect(approved.status).toBe('executed');
    expect(
      (await actuator.execute(signed({ tokenId: 't2', runtime: 'docker', service: 'worker' })))
        .status,
    ).toBe('executed');
    setNow(T0 + 11 * 60_000);
    const scaled = signed({
      tokenId: 't3',
      kind: 'scale',
      service: 'worker',
      replicas: 3,
      issuedOffset: 11 * 60_000 - 1000,
    });
    expect((await actuator.execute(scaled)).status).toBe('executed');
    expect(calls).toEqual([
      'k8s.restart:candy-shop/api',
      'docker.restart:worker',
      'k8s.scale:candy-shop/worker=3',
    ]);
  });

  test('rejected: each failure reason names itself and runs nothing', async () => {
    const { actuator, calls } = setup();
    const cases: Array<[string, unknown]> = [
      ['malformed_request', { nope: true }],
      ['bad_signature', { ...signed(), signature: 'a'.repeat(64) }],
      ['not_an_approver', signed({ approvedBy: 'someone-else' })],
      ['expired', signed({ issuedOffset: -20 * 60_000 })],
      ['ttl_too_long', signed({ ttlMs: 16 * 60_000 })],
      ['not_yet_valid', signed({ issuedOffset: 5_000 })],
      ['policy_deny_rule', signed({ service: 'postgres' })],
      ['policy_no_matching_rule', signed({ signals: ['unrelated'] })],
      ['policy_low_confidence', signed({ confidence: 0.2 })],
      ['policy_no_matching_rule', signed({ service: 'worker', kind: 'scale', replicas: 99 })],
    ];
    await Promise.all(
      cases.map(async ([reason, request]) => {
        const outcome = await actuator.execute(request);
        expect([reason, outcome.status, outcome.reason]).toEqual([reason, 'denied', reason]);
      }),
    );
    expect(calls).toEqual([]);
  });

  test('a backend failure is reported, audited and still consumes the token', async () => {
    const calls: string[] = [];
    const actuator = createActuator({
      secret: SECRET,
      requiredAudit: async (draft) => ({ key: draft.key }),
      durableAdmission: createAdmissionFixture(
        policy,
        () => T0,
        async (draft) => ({ key: draft.key }),
      ).admission,
      namespace: 'candy-shop',
      docker: { restart: async () => {} },
      kube: {
        rolloutRestart: async () => {
          calls.push('x');
          throw new Error('forbidden');
        },
        scale: async () => {},
      },
    });
    const request = signed();
    expect((await actuator.execute(request)).status).toBe('failed');
    expect((await actuator.execute(request)).reason).toBe('already_completed');
  });

  test('audit events carry ids, never the secret or signature', async () => {
    const { actuator } = setup();
    const { audit } = await actuator.execute(signed());
    expect(audit).toMatchObject({
      actor: 'actuator',
      type: 'actuator.executed',
      incidentId: 'inc-1',
    });
    expect(JSON.stringify(audit)).not.toContain(SECRET);
  });

  test('refuses a short secret', () => {
    expect(() =>
      createActuator({
        secret: 'short',
        requiredAudit: async (draft) => ({ key: draft.key }),
        durableAdmission: createAdmissionFixture(
          policy,
          () => T0,
          async (draft) => ({ key: draft.key }),
        ).admission,
        namespace: 'n',
        docker: { restart: async () => {} },
        kube: { rolloutRestart: async () => {}, scale: async () => {} },
      }),
    ).toThrow();
  });
});

describe('approval token properties', () => {
  test('a token never executes twice', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (attempts) => {
        const { actuator, calls } = setup();
        const request = signed();
        const outcomes = await Promise.all(
          Array.from({ length: attempts }, () => actuator.execute(request)),
        );
        expect(outcomes.filter((o) => o.status === 'executed')).toHaveLength(1);
        expect(outcomes.filter((o) => o.reason === 'execution_uncertain')).toHaveLength(
          attempts - 1,
        );
        expect(calls).toHaveLength(1);
      }),
    );
  });

  test('executes iff now is inside [issuedAt, expiresAt) and the TTL is at most 15 minutes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 60_000, max: 30 * 60_000 }),
        fc.integer({ min: -60_000, max: 32 * 60_000 }),
        async (ttlMs, elapsed) => {
          const { actuator, setNow, calls } = setup();
          const request = signRequest(unsigned({ ttlMs, issuedOffset: 0 }), SECRET);
          setNow(T0 + elapsed);
          const outcome = await actuator.execute(request);
          const valid = ttlMs <= 15 * 60_000 && elapsed >= 0 && elapsed < ttlMs;
          expect(outcome.status === 'executed').toBe(valid);
          expect(calls.length).toBe(valid ? 1 : 0);
        },
      ),
      { numRuns: 300 },
    );
  });

  test('a non-approver is never accepted, even with a valid signature', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !policy.approvers.discordUserIds.includes(s)),
        async (user) => {
          const { actuator, calls } = setup();
          expect((await actuator.execute(signed({ approvedBy: user }))).reason).toBe(
            'not_an_approver',
          );
          expect(calls).toEqual([]);
        },
      ),
    );
  });

  test('changing any signed field breaks the signature and runs nothing', async () => {
    const mutations: Array<(r: ActionRequest) => ActionRequest> = [
      (r) => ({ ...r, action: { ...r.action, service: 'worker' } }),
      (r) => ({ ...r, action: { ...r.action, kind: 'scale', replicas: 1 } }),
      (r) => ({ ...r, action: { ...r.action, runtime: 'docker' } }),
      (r) => ({ ...r, action: { ...r.action, id: 'act-2' } }),
      (r) => ({ ...r, approval: { ...r.approval, approvedBy: 'attacker' } }),
      (r) => ({ ...r, approval: { ...r.approval, tokenId: 'tok-new' } }),
      (r) => ({ ...r, approval: { ...r.approval, expiresAt: iso(T0 + 3_600_000) } }),
      (r) => ({ ...r, context: { ...r.context, confidence: 1 } }),
      (r) => ({ ...r, context: { ...r.context, signals: ['restart_loop'] } }),
    ];
    await Promise.all(
      mutations.map(async (mutate) => {
        const { actuator, calls } = setup();
        const outcome = await actuator.execute(mutate(signed()));
        expect(outcome.reason).toBe('bad_signature');
        expect(calls).toEqual([]);
      }),
    );
    fc.assert(
      fc.property(fc.string({ minLength: 32 }), (other) => {
        fc.pre(other !== SECRET);
        expect(verifyHmac(signed(), other)).toBe(false);
      }),
    );
    expect(verifyHmac(signed(), SECRET)).toBe(true);
  });

  test('property: whenever the status is not executed, no backend was called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('api', 'worker', 'postgres', 'other'),
        fc.constantFrom('restart', 'scale' as const),
        fc.constantFrom('docker', 'k8s' as const),
        fc.integer({ min: 0, max: 6 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        async (service, kind, runtime, replicas, confidence) => {
          const { actuator, calls } = setup();
          const outcome = await actuator.execute(
            signed({ service, kind, runtime, replicas, confidence }),
          );
          if (outcome.status !== 'executed') expect(calls).toEqual([]);
          else expect(calls).toHaveLength(1);
        },
      ),
      { numRuns: 300 },
    );
  });
});
