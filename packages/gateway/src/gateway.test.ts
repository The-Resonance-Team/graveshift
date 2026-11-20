import { describe, expect, test } from 'bun:test';
import { type AgentConfig, AgentConfigSchema } from '@graveshift/agents';
import { z } from 'zod';

import type { GatewayConfig } from './config';
import { createGateway, type GatewayOptions } from './gateway';
import type {
  AgentBinding,
  AuditEvent,
  GatewayTask,
  ModelAdapter,
  ModelRequest,
  Usage,
} from './types';

const Out = z.object({ answer: z.string() }).strict();
type Out = z.infer<typeof Out>;

const agent = (over: Partial<AgentConfig> = {}): AgentConfig =>
  AgentConfigSchema.parse({
    name: 'SRE Bot',
    role: 'sre',
    description: 'Handles incidents.',
    prompt: 'Resolve {{INCIDENT_DETAIL}}.',
    params: [{ INCIDENT_DETAIL: '' }],
    provider: '@ai-sdk/google',
    model: 'test-model',
    baseUrl: 'https://models.test/v1',
    apiKeyEnv: 'GRAVESHIFT_TEST_KEY',
    allowedTools: [],
    dailyBudgetUsd: 100,
    ...over,
  });

const task = (over: Partial<GatewayTask<Out>> = {}): GatewayTask<Out> => ({
  agent: 'SRE Bot',
  task: 'diagnose',
  system: 'system',
  prompt: 'prompt',
  schema: Out,
  rulesOnly: () => ({ answer: 'rules' }),
  ...over,
});

interface FakeOptions {
  available?: boolean;
  script?: Array<unknown | Error>;
  usage?: Usage;
  model?: string;
}

function fakeAdapter(over: FakeOptions = {}) {
  const {
    available = true,
    script = [{ answer: 'model' }],
    usage = { in: 1000, out: 0 },
    model = 'test-model',
  } = over;
  const requests: ModelRequest[] = [];
  let calls = 0;
  const adapter: ModelAdapter = {
    provider: '@ai-sdk/google',
    model,
    available: () => available,
    async generateObject(request) {
      requests.push(request);
      const next = script[Math.min(calls++, script.length - 1)];
      if (next instanceof Error) throw next;
      return { object: next, model, usage };
    },
  };
  return { adapter, requests, calls: () => calls };
}

const config: GatewayConfig = {
  globalDailyBudgetUsd: 10000,
  maxRetries: 1,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'test-model': { in: 1000, out: 0 } },
};

const binding = (adapter: ModelAdapter, over: Partial<AgentConfig> = {}): AgentBinding => ({
  agent: agent(over),
  adapter,
});

const make = (agents: AgentBinding[], over: Partial<GatewayOptions> = {}) =>
  createGateway({ agents, config, ...over });

describe('redaction', () => {
  test('system, prompt and untrusted content are redacted before the model', async () => {
    const fake = fakeAdapter();
    const events: AuditEvent[] = [];
    const gw = make([binding(fake.adapter)], { onAudit: (event) => events.push(event) });
    const result = await gw.run(
      task({
        system: 'Bearer abcdef123456',
        prompt: '<untrusted_request>PASSWORD=hunter22 AKIAABCDEFGHIJKLMNOP</untrusted_request>',
      }),
    );
    expect(result.status).toBe('ok');
    const sent = fake.requests[0]!;
    expect(sent.system).not.toContain('abcdef123456');
    expect(sent.prompt).not.toContain('hunter22');
    expect(sent.prompt).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(JSON.stringify(events)).not.toContain('hunter22');
  });
});

describe('budget', () => {
  test('per-agent budget is separate from another agent', async () => {
    const expensive = fakeAdapter({ usage: { in: 2_000_000, out: 0 } });
    const normal = fakeAdapter();
    const gw = make([
      binding(expensive.adapter, { name: 'A', dailyBudgetUsd: 1 }),
      binding(normal.adapter, { name: 'B', dailyBudgetUsd: 100 }),
    ]);
    expect((await gw.run(task({ agent: 'A' }))).status).toBe('ok');
    expect(await gw.run(task({ agent: 'A' }))).toMatchObject({
      status: 'rules_only',
      reason: 'budget',
    });
    expect((await gw.run(task({ agent: 'B' }))).status).toBe('ok');
    expect(expensive.calls()).toBe(1);
    expect(normal.calls()).toBe(1);
  });

  test('global budget stops both agents', async () => {
    const expensive = fakeAdapter({ usage: { in: 2_000_000, out: 0 } });
    const normal = fakeAdapter();
    const gw = createGateway({
      agents: [
        binding(expensive.adapter, { name: 'A', dailyBudgetUsd: 100 }),
        binding(normal.adapter, { name: 'B', dailyBudgetUsd: 100 }),
      ],
      config: { ...config, globalDailyBudgetUsd: 1 },
    });
    expect((await gw.run(task({ agent: 'A' }))).status).toBe('ok');
    expect(await gw.run(task({ agent: 'B' }))).toMatchObject({
      status: 'rules_only',
      reason: 'budget',
    });
    expect(normal.calls()).toBe(0);
  });
});

describe('audit', () => {
  test('every terminal path carries agent, task, status, tokens and cost', async () => {
    const events: AuditEvent[] = [];
    const onAudit = (event: AuditEvent) => events.push(event);

    await make([binding(fakeAdapter().adapter)], { onAudit }).run(task());

    const budgetGw = createGateway({
      agents: [
        binding(fakeAdapter({ usage: { in: 2_000_000, out: 0 } }).adapter, {
          dailyBudgetUsd: 1,
        }),
      ],
      config,
      onAudit,
    });
    await budgetGw.run(task());
    await budgetGw.run(task());

    await make([binding(fakeAdapter({ available: false }).adapter)], { onAudit }).run(task());
    await make([binding(fakeAdapter({ script: [{ nope: 1 }] }).adapter)], { onAudit }).run(task());
    await make([binding(fakeAdapter({ script: [{ nope: 1 }] }).adapter)], { onAudit }).run(
      task({ rulesOnly: undefined as never }),
    );
    await make([binding(fakeAdapter({ script: [new Error('down')] }).adapter)], { onAudit }).run(
      task({ rulesOnly: undefined as never }),
    );

    expect(events.map((event) => event.status)).toEqual([
      'ok',
      'ok',
      'rules_only',
      'rules_only',
      'rules_only',
      'invalid',
      'unavailable',
    ]);
    for (const event of events) {
      expect(event.agent).toBe('SRE Bot');
      expect(event.task).toBe('diagnose');
      expect(typeof event.tokensIn).toBe('number');
      expect(typeof event.tokensOut).toBe('number');
      expect(typeof event.costUsd).toBe('number');
    }
    expect(events[0]).toMatchObject({ tokensIn: 1000, costUsd: 1 });
    expect(events[2]).toMatchObject({ tokensIn: 0, tokensOut: 0, costUsd: 0 });
  });
});

describe('retry and validation', () => {
  test('transport errors retry from config count', async () => {
    const flaky = fakeAdapter({
      script: [new Error('timeout'), new Error('503'), { answer: 'recovered' }],
    });
    const gw = createGateway({
      agents: [binding(flaky.adapter)],
      config: { ...config, maxRetries: 2 },
    });
    expect(await gw.run(task())).toMatchObject({ status: 'ok', value: { answer: 'recovered' } });
    expect(flaky.calls()).toBe(3);

    const broken = fakeAdapter({ script: [new Error('down')] });
    const gw2 = createGateway({
      agents: [binding(broken.adapter)],
      config: { ...config, maxRetries: 2 },
    });
    expect(await gw2.run(task())).toMatchObject({ status: 'rules_only', reason: 'unavailable' });
    expect(broken.calls()).toBe(3);
  });

  test('exactly one validation retry happens with a redacted reason', async () => {
    const stubborn = fakeAdapter({ script: [{ nope: 1 }, { nope: 2 }, { answer: 'third' }] });
    expect(await make([binding(stubborn.adapter)]).run(task())).toMatchObject({
      status: 'rules_only',
      reason: 'invalid',
    });
    expect(stubborn.calls()).toBe(2);
    expect(stubborn.requests[1]!.prompt).toContain('<validation_error>');

    const fixed = fakeAdapter({ script: [{ nope: 1 }, { answer: 'fixed' }] });
    expect(await make([binding(fixed.adapter)]).run(task())).toMatchObject({
      status: 'ok',
      value: { answer: 'fixed' },
    });
    expect(fixed.calls()).toBe(2);

    const secret = fakeAdapter({ script: [{ answer: 'PASSWORD=hunter22' }] });
    await make([binding(secret.adapter)]).run(
      task({ validate: (value) => `unseen ref ${value.answer}` }),
    );
    expect(secret.requests[1]!.prompt).not.toContain('hunter22');
    expect(secret.requests[1]!.prompt).toContain('[REDACTED:env]');
  });

  test('evidence validation uses the same retry path and rules-only fallback', async () => {
    const validate = (value: Out) => (value.answer === 'good' ? undefined : 'unseen ref log:99');
    const corrected = fakeAdapter({ script: [{ answer: 'bad' }, { answer: 'good' }] });
    expect(await make([binding(corrected.adapter)]).run(task({ validate }))).toMatchObject({
      status: 'ok',
      value: { answer: 'good' },
    });
    expect(corrected.calls()).toBe(2);

    const stubborn = fakeAdapter({ script: [{ answer: 'bad' }] });
    expect(await make([binding(stubborn.adapter)]).run(task({ validate }))).toMatchObject({
      status: 'rules_only',
      value: { answer: 'rules' },
      reason: 'invalid',
    });
    expect(stubborn.calls()).toBe(2);
  });
});

describe('fallback and permissions', () => {
  test('unavailable and invalid output use the deterministic rules-only value', async () => {
    const unavailable = await make([binding(fakeAdapter({ available: false }).adapter)]).run(
      task(),
    );
    const invalid = await make([binding(fakeAdapter({ script: [{ nope: 1 }] }).adapter)]).run(
      task(),
    );
    expect(unavailable).toMatchObject({ status: 'rules_only', value: { answer: 'rules' } });
    expect(invalid).toMatchObject({ status: 'rules_only', value: { answer: 'rules' } });
  });

  test('model output cannot grant a permission', async () => {
    const events: AuditEvent[] = [];
    const fake = fakeAdapter({ script: [{ answer: 'ok', permissions: ['deploy'] }] });
    const result = await make([binding(fake.adapter)], {
      onAudit: (event) => events.push(event),
    }).run(task());
    expect(result).toMatchObject({ status: 'rules_only', reason: 'invalid' });
    expect(JSON.stringify(result)).not.toContain('permissions');
    expect(JSON.stringify(events)).not.toContain('deploy');
  });

  test('the API key never reaches a prompt, audit event or log', async () => {
    const key = 'fake-key-998877';
    const logs: string[] = [];
    const fake = fakeAdapter({
      script: [new Error(`upstream failed with ${key}`), { answer: 'ok' }],
    });
    const gw = make([binding(fake.adapter, { apiKeyEnv: 'GRAVESHIFT_TEST_KEY' })], {
      onAudit: (event) => logs.push(JSON.stringify(event)),
    });
    expect((await gw.run(task())).status).toBe('ok');
    expect(logs.join('\n')).not.toContain(key);
    expect(JSON.stringify(fake.requests)).not.toContain(key);
    expect(JSON.stringify(gw.globalBudget)).not.toContain(key);
  });
});
