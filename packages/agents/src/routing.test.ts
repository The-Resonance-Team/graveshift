import { describe, expect, test } from 'bun:test';

import type { AgentConfig } from './config';
import { createRoutingAgent, type RoutingModel } from './routing';

class FakeModel implements RoutingModel {
  readonly calls: Array<{ system: string; prompt: string }> = [];
  private readonly answer: string;

  constructor(answer: string) {
    this.answer = answer;
  }

  async generateText(input: { system: string; prompt: string }): Promise<string> {
    this.calls.push(input);
    return this.answer;
  }
}

const sreBot: AgentConfig = {
  name: 'SRE Bot',
  role: 'sre',
  description: 'Handles incidents, outages and OOM VPS restarts.',
  prompt: 'Resolve {{INCIDENT_DETAIL}} on version {{VERSION}}.',
  params: [{ VERSION: 'v1' }, { INCIDENT_DETAIL: 'OOM VPS' }],
  provider: '@ai-sdk/google',
  model: 'gemini-3.8-flash-high',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
  allowedTools: ['query_metric'],
  dailyBudgetUsd: 2.5,
};

const devopsBot: AgentConfig = {
  name: 'DevOps Bot',
  role: 'devops',
  description: 'Handles deployment, pipeline and infrastructure tasks.',
  prompt: 'Check deployment {{VERSION}} for {{SERVICE}}.',
  params: [{ VERSION: 'v1' }, { SERVICE: 'api' }],
  provider: '@ai-sdk/anthropic',
  model: 'claude-sonnet-5.5',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  allowedTools: ['propose_fix'],
  dailyBudgetUsd: 5,
};

describe('routing agent', () => {
  test('selects the target agent by trigger keywords', async () => {
    const model = new FakeModel('question');
    const routing = createRoutingAgent({ agents: [sreBot, devopsBot], model });

    const sre = await routing.route({
      text: 'We have an OOM VPS restart',
      params: { VERSION: 'v1', INCIDENT_DETAIL: 'OOM VPS' },
    });
    const devops = await routing.route({
      text: 'The deployment pipeline is broken',
      params: { VERSION: 'v1', SERVICE: 'api' },
    });
    const none = await routing.route({ text: 'Good morning' });

    expect(sre.kind === 'routed' && sre.agent.name).toBe('SRE Bot');
    expect(devops.kind === 'routed' && devops.agent.name).toBe('DevOps Bot');
    expect(none).toEqual({
      kind: 'needs_human',
      reason: 'no target agent matches the request keywords',
      missing: [],
    });
  });

  test('fills multiple params in the target prompt', async () => {
    const model = new FakeModel('question');
    const routing = createRoutingAgent({ agents: [sreBot, devopsBot], model });

    const result = await routing.route({
      text: 'OOM VPS incident',
      params: { VERSION: 'v2', INCIDENT_DETAIL: 'OOM VPS on proxy' },
    });

    expect(result.kind).toBe('routed');
    if (result.kind !== 'routed') return;
    expect(result.prompt).toBe('Resolve OOM VPS on proxy on version v2.');
    expect(result.prompt).not.toContain('{{');
    expect(model.calls).toHaveLength(0);
  });

  test('asks once for a missing param, then returns needs_human', async () => {
    const model = new FakeModel('Please give INCIDENT_DETAIL.');
    const routing = createRoutingAgent({ agents: [sreBot, devopsBot], model });
    const request = { text: 'OOM VPS incident', params: { VERSION: 'v2' } };

    const asked = await routing.route(request);
    expect(asked.kind).toBe('ask');
    if (asked.kind !== 'ask') return;
    expect(asked.missing).toEqual(['INCIDENT_DETAIL']);
    expect(asked.question).toBe('Please give INCIDENT_DETAIL.');
    expect(model.calls).toHaveLength(1);

    const human = await routing.route({ ...request, alreadyAsked: true });
    expect(human.kind).toBe('needs_human');
    if (human.kind !== 'needs_human') return;
    expect(human.missing).toEqual(['INCIDENT_DETAIL']);
    expect(human.reason).toContain('INCIDENT_DETAIL');
    expect(model.calls).toHaveLength(1);
  });
});
