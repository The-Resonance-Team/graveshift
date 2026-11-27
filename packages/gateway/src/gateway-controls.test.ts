import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { createGateway } from './gateway';
import { acknowledgedAudit, binding, config, fakeAdapter, make, task } from './testing';
import {
  type AuditEvent,
  type GeneratedObject,
  type GatewayTask,
  type ModelAdapter,
  GatewayConfigError,
} from './types';

describe('budget recheck and totals', () => {
  test('no validation retry after the first call uses the last of a budget', async () => {
    const perAgent = fakeAdapter({
      script: [{ nope: 1 }, { answer: 'late' }],
      usage: { in: 1_000_000, out: 0 },
    });
    expect(
      await make([binding(perAgent.adapter, { dailyBudgetUsd: 1 })]).run(task()),
    ).toMatchObject({
      status: 'rules_only',
      reason: 'budget',
    });
    expect(perAgent.calls()).toBe(1);

    const global = fakeAdapter({
      script: [{ nope: 1 }, { answer: 'late' }],
      usage: { in: 1_000_000, out: 0 },
    });
    const gw = createGateway({
      agents: [binding(global.adapter)],
      config: { ...config, globalDailyBudgetUsd: 1 },
      onAudit: acknowledgedAudit(),
    });
    expect(await gw.run(task())).toMatchObject({ status: 'rules_only', reason: 'budget' });
    expect(global.calls()).toBe(1);
  });

  test('audit and ok/invalid results report total usage across attempts', async () => {
    const events: AuditEvent[] = [];
    const flaky = fakeAdapter({
      script: [new Error('timeout'), { answer: 'ok' }],
      usage: { in: 1000, out: 200 },
    });
    const ok = await createGateway({
      agents: [binding(flaky.adapter)],
      config,
      onAudit: acknowledgedAudit(events),
    }).run(task());
    expect(ok).toMatchObject({ status: 'ok', usage: { in: 1000, out: 200 }, costUsd: 1 });
    expect(events[0]).toMatchObject({ tokensIn: 1000, tokensOut: 200, costUsd: 1 });

    const charged = fakeAdapter({ script: [{ nope: 1 }], usage: { in: 1000, out: 0 } });
    const invalid = await make([binding(charged.adapter)]).run(
      task({ rulesOnly: undefined as never }),
    );
    expect(invalid).toMatchObject({ status: 'invalid', usage: { in: 2000, out: 0 }, costUsd: 2 });

    const chargedThenFailed = fakeAdapter({
      script: [{ nope: 1 }, new Error('down')],
      usage: { in: 1000, out: 0 },
    });
    const failedEvents: AuditEvent[] = [];
    const result = await createGateway({
      agents: [binding(chargedThenFailed.adapter)],
      config,
      onAudit: acknowledgedAudit(failedEvents),
    }).run(task());
    expect(result.status).toBe('rules_only');
    expect(failedEvents[0]).toMatchObject({
      status: 'rules_only',
      tokensIn: 1000,
      tokensOut: 0,
      costUsd: 1,
    });
  });

  test('a model missing from the price table fails closed', async () => {
    const events: AuditEvent[] = [];
    const fake = fakeAdapter();
    fake.adapter.generateObject = async () => ({
      object: { answer: 'ok' },
      model: 'unpriced-model',
      usage: { in: 1000, out: 0 },
    });
    expect(
      await make([binding(fake.adapter)], { onAudit: acknowledgedAudit(events) }).run(task()),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'pricing_unavailable',
      usage: { in: 1000, out: 0 },
      costUsd: null,
    });
    expect(events[0]).toMatchObject({ status: 'unavailable', tokensIn: 1000, costUsd: null });
  });

  test('duplicate agent names are rejected', () => {
    expect(() => make([binding(fakeAdapter().adapter), binding(fakeAdapter().adapter)])).toThrow(
      GatewayConfigError,
    );
  });
});

describe('redaction of terminal results and failing callbacks', () => {
  test('the invalid reason is redacted for the caller', async () => {
    const fake = fakeAdapter({ script: [{ answer: 'PASSWORD=hunter22' }] });
    const result = await make([binding(fake.adapter)]).run(
      task({ validate: (value) => `unseen ref ${value.answer}`, rulesOnly: undefined as never }),
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('expected invalid');
    expect(result.reason).not.toContain('hunter22');
    expect(result.reason).toContain('[REDACTED:env]');
  });

  test('thrown validate and rulesOnly still produce a typed result and one audit event', async () => {
    const events: AuditEvent[] = [];
    const onAudit = acknowledgedAudit(events);
    const validate = () => {
      throw new Error('validator exploded');
    };
    const rulesOnly = () => {
      throw new Error('fallback exploded');
    };
    const invalid = await make([binding(fakeAdapter({ script: [{ answer: 'bad' }] }).adapter)], {
      onAudit,
    }).run(task({ validate, rulesOnly: undefined as never }));
    expect(invalid).toMatchObject({ status: 'unavailable', reason: 'validation_unavailable' });

    const fallback = await make([binding(fakeAdapter({ available: false }).adapter)], {
      onAudit,
    }).run(task({ rulesOnly }));
    expect(fallback).toMatchObject({ status: 'unavailable', reason: 'fallback_unavailable' });
    expect(events).toHaveLength(2);
    expect(events[1]?.reason).toContain('rules-only fallback failed');
  });

  test('timeoutMs aborts a hung call', async () => {
    let aborted = false;
    const hung: ModelAdapter = {
      provider: '@ai-sdk/google',
      model: 'test-model',
      capability: 'structured_language',
      available: () => true,
      async generateObject({ signal }): Promise<GeneratedObject> {
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        });
      },
    };
    const started = Date.now();
    const result = await createGateway({
      agents: [binding(hung)],
      config: { ...config, timeoutMs: 10, maxRetries: 0 },
      onAudit: acknowledgedAudit(),
    }).run(task());
    expect(result.status).toBe('rules_only');
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('output fields named permission and allowed are ignored', async () => {
    const Loose = z.object({ answer: z.string() });
    const events: AuditEvent[] = [];
    const fake = fakeAdapter({
      script: [{ answer: 'ok', permission: 'grant', allowed: ['deploy'] }],
    });
    const looseTask: GatewayTask<z.infer<typeof Loose>> = {
      agent: 'SRE Bot',
      task: 'diagnose',
      system: 'system',
      prompt: 'prompt',
      schema: Loose,
      validate: () => undefined,
    };
    const result = await make([binding(fake.adapter)], {
      onAudit: acknowledgedAudit(events),
    }).run(looseTask);
    expect(result).toMatchObject({ status: 'ok', value: { answer: 'ok' } });
    expect(JSON.stringify(result)).not.toContain('grant');
    expect(JSON.stringify(result)).not.toContain('deploy');
    expect(JSON.stringify(events)).not.toContain('grant');
  });
});
