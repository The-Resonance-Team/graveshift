import {
  type AgentBinding,
  type AuditEvent,
  createAdapter,
  createGateway,
  type GatewayConfig,
} from '@graveshift/gateway';

import type { DiagnoseDeps } from './diagnose';

const incidentAgent: AgentBinding['agent'] = {
  name: 'Incident Agent',
  slug: 'incident-agent',
  role: 'sre',
  description: 'Handles incidents.',
  prompt: 'Diagnose the incident.',
  params: [],
  provider: '@ai-sdk/openai-compatible',
  model: 'test-diagnosis',
  baseUrl: 'https://incidents.test/v1',
  apiKeyEnv: 'GRAVESHIFT_TEST_KEY',
  allowedTools: [],
  dailyBudgetUsd: 100,
  autoFix: false,
};

export const otherAgent = {
  ...incidentAgent,
  name: 'Other Agent',
  slug: 'other-agent',
  model: 'test-other',
  baseUrl: 'https://other.test/v1',
};

export function replayAdapter(
  responses: unknown[],
  {
    dailyBudgetUsd = incidentAgent.dailyBudgetUsd,
    ...config
  }: Partial<GatewayConfig> & {
    dailyBudgetUsd?: number;
  } = {},
) {
  const requests: Array<{ url: string; body: string }> = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = responses[Math.min(requests.length, responses.length - 1)];
    requests.push({ url: input.toString(), body: String(init?.body) });
    if (response instanceof Error) return Response.json({ error: 'busy' }, { status: 503 });
    return Response.json({
      id: 'chatcmpl-test',
      model: incidentAgent.model,
      choices: [
        { index: 0, message: { content: JSON.stringify(response) }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    });
  }) as typeof globalThis.fetch;

  const agents = responses.length === 0 ? [] : [otherAgent, { ...incidentAgent, dailyBudgetUsd }];
  const events: AuditEvent[] = [];
  const gateway = createGateway({
    agents: agents.map((agent) => ({
      agent,
      adapter: createAdapter(agent, { env: { GRAVESHIFT_TEST_KEY: 'fake-test-key' }, fetch }),
    })),
    config: {
      timeoutMs: 1000,
      maxRetries: 0,
      globalDailyBudgetUsd: 100,
      priceTableUsdPer1M: {
        [incidentAgent.model]: { in: 10_000, out: 0 },
        [otherAgent.model]: { in: 10_000, out: 0 },
      },
      ...config,
    },
    onAudit: async (event) => {
      events.push(event);
      return { callId: event.callId };
    },
  });
  return { gateway, requests, events };
}

export const deps = (
  gateway: DiagnoseDeps['gateway'],
  agent = incidentAgent.name,
): DiagnoseDeps => ({
  gateway,
  agent,
  now: () => new Date('2026-11-20T10:01:00.000Z'),
  newId: () => 'dia-1',
});
