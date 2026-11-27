import { describe, expect, test } from 'bun:test';

import { createGateway } from './gateway';
import { acknowledgedAudit, binding, config, fakeAdapter, make, task } from './testing';
import type { AuditAck, AuditEvent, GatewayOptions } from './index';
import type { GatewayStatus } from './types';

describe('durable audit acknowledgement', () => {
  test('withholds a successful value until the matching durable acknowledgement', async () => {
    const seen = Promise.withResolvers<AuditEvent>();
    const durable = Promise.withResolvers<AuditAck>();
    let settled = false;
    const fake = fakeAdapter();
    const gateway = make([binding(fake.adapter)], {
      onAudit: async (event) => {
        seen.resolve(event);
        return durable.promise;
      },
    });
    const pending = gateway.run(task()).then((result) => {
      settled = true;
      return result;
    });
    const event = await seen.promise;
    expect(event.status).toBe('ok');
    expect(settled).toBe(false);
    durable.resolve({ callId: event.callId });
    expect(await pending).toMatchObject({ status: 'ok', callId: event.callId });
    expect(fake.calls()).toBe(1);
  });

  test.each<GatewayStatus>(['ok', 'invalid', 'rules_only', 'unavailable'])(
    'one failed audit handoff for %s never causes a retry or a second decision',
    async (status) => {
      const fake = fakeAdapter({
        available: status !== 'unavailable',
        script:
          status === 'invalid' || status === 'rules_only' ? [{ nope: true }] : [{ answer: 'ok' }],
      });
      let fallbackCalls = 0;
      const events: AuditEvent[] = [];
      const gateway = make([binding(fake.adapter)], {
        onAudit: async (event) => {
          events.push(event);
          throw new Error('durable store unavailable');
        },
      });
      const input = task();
      delete input.rulesOnly;
      if (status === 'rules_only')
        input.rulesOnly = () => {
          fallbackCalls++;
          return { answer: 'rules' };
        };
      const result = await gateway.run(input);
      const calls = status === 'unavailable' ? 0 : status === 'ok' ? 1 : 2;
      expect(result).toMatchObject({
        status: 'unavailable',
        reason: 'audit_unavailable',
        usage: { in: calls * 1000, out: 0 },
        costUsd: calls,
      });
      expect(result).not.toHaveProperty('value');
      expect(events).toHaveLength(1);
      expect(events[0]?.status).toBe(status);
      expect(fake.calls()).toBe(calls);
      expect(fallbackCalls).toBe(status === 'rules_only' ? 1 : 0);
    },
  );

  test('an acknowledgement for a different call cannot accept a result', async () => {
    let handoffs = 0;
    const gateway = make([binding(fakeAdapter().adapter)], {
      onAudit: async () => {
        handoffs++;
        return { callId: 'another-call' };
      },
    });
    expect(await gateway.run(task())).toMatchObject({
      status: 'unavailable',
      reason: 'audit_unavailable',
    });
    expect(handoffs).toBe(1);
  });

  test('a missing required sink fails before any model call', () => {
    const fake = fakeAdapter();
    const raw = { agents: [binding(fake.adapter)], config };
    expect(() => Reflect.apply(createGateway, undefined, [raw])).toThrow(
      'durable audit sink is required',
    );
    expect(fake.calls()).toBe(0);
  });

  test('call identities remain distinct even for the same Agent and task', async () => {
    const events: AuditEvent[] = [];
    const options: Partial<GatewayOptions> = { onAudit: acknowledgedAudit(events) };
    const gateway = make([binding(fakeAdapter().adapter)], options);
    const results = await Promise.all([gateway.run(task()), gateway.run(task())]);
    expect(results[0]?.callId).not.toBe(results[1]?.callId);
    expect(events.map(({ callId }) => callId)).toEqual(results.map(({ callId }) => callId));
  });
});
