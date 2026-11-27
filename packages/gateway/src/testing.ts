import { type AgentConfig, AgentConfigSchema } from '@graveshift/agents';
import { z } from 'zod';

import type { GatewayConfig } from './config';
import { createGateway, type GatewayOptions } from './gateway';
import type {
  AgentBinding,
  AuditEvent,
  AuditSink,
  GatewayTask,
  ModelAdapter,
  ModelRequest,
  Usage,
} from './types';

export const Out = z.object({ answer: z.string() }).strict();
export type Out = z.infer<typeof Out>;

export const agent = (over: Partial<AgentConfig> = {}): AgentConfig =>
  AgentConfigSchema.parse({
    name: 'SRE Bot',
    slug: 'sre-bot',
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

export const task = (over: Partial<GatewayTask<Out>> = {}): GatewayTask<Out> => ({
  agent: 'SRE Bot',
  task: 'diagnose',
  system: 'system',
  prompt: 'prompt',
  schema: Out,
  validate: () => undefined,
  rulesOnly: () => ({ answer: 'rules' }),
  ...over,
});

export interface FakeOptions {
  available?: boolean;
  script?: Array<unknown | Error>;
  usage?: Usage;
  model?: string;
}

export function fakeAdapter(over: FakeOptions = {}) {
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
    capability: 'structured_language',
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

export const config: GatewayConfig = {
  globalDailyBudgetUsd: 10000,
  maxRetries: 1,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'test-model': { in: 1000, out: 0 } },
};

export const binding = (adapter: ModelAdapter, over: Partial<AgentConfig> = {}): AgentBinding => ({
  agent: agent({ model: adapter.model, ...over }),
  adapter,
});

export const acknowledgedAudit =
  (events: AuditEvent[] = []): AuditSink =>
  async (event) => {
    events.push(event);
    return { callId: event.callId };
  };

export const make = (agents: AgentBinding[], over: Partial<GatewayOptions> = {}) =>
  createGateway({ agents, config, onAudit: acknowledgedAudit(), ...over });
