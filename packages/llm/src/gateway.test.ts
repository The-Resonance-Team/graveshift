import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { z } from 'zod';

import { createBudget } from './budget';
import { createGateway } from './gateway';
import type { AuditEvent, LlmProvider, LlmTask, ProviderName } from './types';

const Out = z.object({ answer: z.string() });
type Out = z.infer<typeof Out>;

const task = (over: Partial<LlmTask<Out>> = {}): LlmTask<Out> => ({
  name: 'diagnose',
  tier: 'smart',
  system: 'system',
  prompt: 'prompt',
  schema: Out,
  rulesOnly: () => ({ answer: 'rules' }),
  ...over,
});

interface FakeOptions {
  name: ProviderName;
  paid?: boolean;
  available?: boolean;
  script?: Array<unknown | Error>;
  usage?: { in: number; out: number };
}

function fake({
  name,
  paid = true,
  available = true,
  script = [{ answer: name }],
  usage = { in: 1000, out: 0 },
}: FakeOptions) {
  const prompts: string[] = [];
  let call = 0;
  const provider: LlmProvider = {
    name,
    paid,
    available: () => available,
    async generateObject({ prompt }) {
      prompts.push(prompt);
      const next = script[Math.min(call++, script.length - 1)];
      if (next instanceof Error) throw next;
      return { object: next, model: `${name}-model`, usage };
    },
  };
  return { provider, prompts, calls: () => call };
}

const config = {
  timeoutMs: 1000,
  maxRetries: 1,
  priceTableUsdPer1M: { 'bedrock-model': { in: 1000, out: 0 } },
};
const gateway = (
  providers: LlmProvider[],
  over: { dailyBudgetUsd?: number; onAudit?: (e: AuditEvent) => void } = {},
) =>
  createGateway({
    providers,
    config,
    dailyBudgetUsd: over.dailyBudgetUsd ?? 100,
    ...(over.onAudit ? { onAudit: over.onAudit } : {}),
  });

describe('provider chain', () => {
  test('uses the first available provider', async () => {
    const result = await gateway([
      fake({ name: 'bedrock' }).provider,
      fake({ name: 'gemini' }).provider,
    ]).run(task());
    expect(result).toMatchObject({
      status: 'ok',
      provider: 'bedrock',
      value: { answer: 'bedrock' },
    });
  });

  test('falls through unavailable and failing providers in order', async () => {
    const down = fake({ name: 'bedrock', available: false });
    const broken = fake({ name: 'gemini', script: [new Error('503')] });
    const local = fake({ name: 'ollama', paid: false });
    const result = await gateway([down.provider, broken.provider, local.provider]).run(task());
    expect(result).toMatchObject({ status: 'ok', provider: 'ollama' });
    expect(result.status === 'ok' && result.skipped).toEqual([
      { provider: 'bedrock', reason: 'unavailable' },
      { provider: 'gemini', reason: 'failed' },
    ]);
    expect(broken.calls()).toBe(2);
  });

  test('transport errors retry up to maxRetries before moving on', async () => {
    const flaky = fake({
      name: 'bedrock',
      script: [new Error('timeout'), { answer: 'recovered' }],
    });
    const result = await gateway([flaky.provider]).run(task());
    expect(result).toMatchObject({ status: 'ok', value: { answer: 'recovered' } });
  });

  test('uses rules-only when every provider is out, and unavailable without a fallback', async () => {
    const providers = [fake({ name: 'bedrock', available: false }).provider];
    expect(await gateway(providers).run(task())).toMatchObject({
      status: 'rules_only',
      value: { answer: 'rules' },
    });
    expect(await gateway(providers).run(task({ rulesOnly: undefined as never }))).toMatchObject({
      status: 'unavailable',
    });
  });
});

describe('budget', () => {
  test('stops paid providers once spent, keeps free ones', async () => {
    const paid = fake({ name: 'bedrock', usage: { in: 2_000_000, out: 0 } });
    const free = fake({ name: 'ollama', paid: false });
    const gw = gateway([paid.provider, free.provider], { dailyBudgetUsd: 1 });
    expect((await gw.run(task())).status === 'ok' && (await gw.run(task()))).toMatchObject({
      provider: 'ollama',
    });
    expect(paid.calls()).toBe(1);
  });

  test('property: spend is additive and exhaustion is monotone until the day rolls over', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5_000_000 }), { maxLength: 20 }), (tokens) => {
        const budget = createBudget(5, { m: { in: 1, out: 0 } });
        let total = 0;
        let wasExhausted = false;
        for (const t of tokens) {
          total += budget.record('m', { in: t, out: 0 });
          if (wasExhausted) expect(budget.exhausted()).toBe(true);
          wasExhausted = budget.exhausted();
        }
        expect(budget.spentUsd()).toBeCloseTo(total, 6);
        expect(wasExhausted).toBe(total >= 5);
      }),
    );
  });

  test('budget resets on a new UTC day', () => {
    let now = new Date('2026-11-20T23:00:00Z');
    const budget = createBudget(1, { m: { in: 1_000_000, out: 0 } }, () => now);
    budget.record('m', { in: 1, out: 0 });
    expect(budget.exhausted()).toBe(true);
    now = new Date('2026-11-21T00:00:01Z');
    expect(budget.exhausted()).toBe(false);
  });
});

describe('validation, redaction, audit', () => {
  test('invalid output retries once with the reason, then reports invalid', async () => {
    const stubborn = fake({ name: 'bedrock', script: [{ nope: 1 }] });
    const result = await gateway([stubborn.provider]).run(task());
    expect(result.status).toBe('invalid');
    expect(stubborn.calls()).toBe(2);
    expect(stubborn.prompts[1]).toContain('<validation_error>');
  });

  test('a corrected second answer is accepted', async () => {
    const fixes = fake({ name: 'bedrock', script: [{ nope: 1 }, { answer: 'fixed' }] });
    expect(await gateway([fixes.provider]).run(task())).toMatchObject({
      status: 'ok',
      value: { answer: 'fixed' },
    });
  });

  test('evidence validator failures follow the same retry path', async () => {
    const p = fake({ name: 'bedrock', script: [{ answer: 'bad' }, { answer: 'good' }] });
    const result = await gateway([p.provider]).run(
      task({ validate: (v) => (v.answer === 'good' ? undefined : 'unseen ref') }),
    );
    expect(result).toMatchObject({ status: 'ok', value: { answer: 'good' } });
  });

  test('secrets never reach a provider and audit events carry no prompt', async () => {
    const p = fake({ name: 'ollama', paid: false });
    const events: AuditEvent[] = [];
    await gateway([p.provider], { onAudit: (e) => events.push(e) }).run(
      task({
        prompt: 'db DB_PASSWORD=hunter22 and AKIAABCDEFGHIJKLMNOP',
        system: 'Bearer abcdef123456',
      }),
    );
    expect(p.prompts[0]).not.toContain('hunter22');
    expect(p.prompts[0]).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      task: 'diagnose',
      status: 'ok',
      provider: 'ollama',
      tokensIn: 1000,
    });
    expect(JSON.stringify(events[0])).not.toContain('hunter22');
  });

  test('property: any secret injected in the prompt is absent from every provider call', async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[A-Za-z0-9]{8,20}$/), async (secret) => {
        const p = fake({ name: 'ollama', paid: false });
        await gateway([p.provider]).run(task({ prompt: `token PASSWORD=${secret} end` }));
        expect(p.prompts.join('\n')).not.toContain(secret);
      }),
      { numRuns: 50 },
    );
  });
});
