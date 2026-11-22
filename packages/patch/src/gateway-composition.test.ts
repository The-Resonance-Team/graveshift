import { describe, expect, test } from 'bun:test';
import { AgentConfigSchema } from '@graveshift/agents';
import {
  createAdapter,
  createGateway,
  type AuditEvent,
  type AuditSink,
  type GatewayConfig,
} from '@graveshift/gateway';

import { generatePatch, PATCH_SYSTEM } from './generate';
import type { Patch, RepoRules } from './schemas';
import { TEST_BASE_SHA, TEST_BLOB_SHA } from './test-constants';

const agent = AgentConfigSchema.parse({
  name: 'Patch Agent',
  slug: 'patch-agent',
  role: 'fix',
  description: 'Prepares patches.',
  prompt: 'Propose a patch.',
  params: [],
  provider: '@ai-sdk/openai-compatible',
  model: 'recorded-patch',
  baseUrl: 'https://patch.test/v1',
  apiKeyEnv: 'GRAVESHIFT_TEST_KEY',
  allowedTools: [],
  dailyBudgetUsd: 100,
});
const rules: RepoRules = {
  maxFilesChanged: 2,
  maxLinesChanged: 3,
  allowedPaths: ['src/**'],
  forbiddenPaths: ['src/private/**'],
};
const valid: Patch = {
  baseSha: TEST_BASE_SHA,
  files: [{ path: 'src/a.ts', content: 'fixed', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA }],
};
const outside: Patch = {
  baseSha: TEST_BASE_SHA,
  files: [
    { path: 'deploy/a.yaml', content: 'unsafe', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA },
  ],
};

function replay(responses: unknown[], over: Partial<GatewayConfig> = {}, sink?: AuditSink) {
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = Object.assign(
    async (_input: string | URL | Request, init?: RequestInit) => {
      const value = responses[Math.min(requests.length, responses.length - 1)];
      requests.push(String(init?.body));
      return Response.json({
        id: 'chatcmpl-recorded',
        model: agent.model,
        choices: [{ index: 0, message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });
    },
    { preconnect: () => {} },
  );
  const events: AuditEvent[] = [];
  const gateway = createGateway({
    agents: [
      {
        agent,
        adapter: createAdapter(agent, { env: { GRAVESHIFT_TEST_KEY: 'recorded-test-key' }, fetch }),
      },
    ],
    config: {
      globalDailyBudgetUsd: 100,
      maxRetries: 0,
      timeoutMs: 1000,
      priceTableUsdPer1M: { [agent.model]: { in: 10_000, out: 0 } },
      ...over,
    },
    onAudit:
      sink ??
      (async (event) => {
        events.push(event);
        return { callId: event.callId };
      }),
  });
  return {
    requests,
    events,
    gateway,
    options: {
      gateway,
      agent: agent.name,
      system: PATCH_SYSTEM,
      rules,
      diagnosis: 'The file is broken.',
    },
  };
}

describe('Patch with the shared gateway and recorded SDK responses', () => {
  test('an unsafe path followed by a valid patch uses the single correction retry', async () => {
    const replayed = replay([outside, valid]);
    expect(await generatePatch(replayed.options)).toEqual({ ok: true, patch: valid });
    expect(replayed.requests).toHaveLength(2);
    expect(replayed.requests[1]).toContain('outside allowedPaths');
    expect(replayed.requests[1]).toContain('<untrusted_validation_error>');
    expect(replayed.events).toMatchObject([
      { status: 'ok', tokensIn: 200, tokensOut: 40, costUsd: 2 },
    ]);
  });

  test.each([
    ['path', outside],
    [
      'size',
      {
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/a.ts',
            content: 'one\ntwo\nthree\nfour',
            linesChanged: 1,
            baseBlobSha: TEST_BLOB_SHA,
          },
        ],
      },
    ],
    [
      'collision',
      {
        baseSha: TEST_BASE_SHA,
        files: [
          { path: 'src/a.ts', content: 'one', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA },
          { path: 'src/A.ts', content: 'two', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA },
        ],
      },
    ],
  ])('repeated semantic %s failures are rejected after two billed calls', async (_kind, bad) => {
    const replayed = replay([bad, bad, valid]);
    expect(await generatePatch(replayed.options)).toMatchObject({ ok: false });
    expect(replayed.requests).toHaveLength(2);
    expect(replayed.events).toMatchObject([{ status: 'invalid', tokensIn: 200, costUsd: 2 }]);
  });

  test('schema and semantic failures share one correction budget', async () => {
    const replayed = replay([{ garbage: true }, outside, valid]);
    expect(await generatePatch(replayed.options)).toMatchObject({ ok: false });
    expect(replayed.requests).toHaveLength(2);
    expect(replayed.events).toMatchObject([{ status: 'invalid', tokensIn: 200, costUsd: 2 }]);
  });

  test('budget exhaustion after a billed unsafe response prevents the correction call', async () => {
    const replayed = replay([outside, valid], { globalDailyBudgetUsd: 1 });
    expect(await generatePatch(replayed.options)).toMatchObject({ ok: false });
    expect(replayed.requests).toHaveLength(1);
    expect(replayed.events).toMatchObject([{ status: 'unavailable', tokensIn: 100, costUsd: 1 }]);
    expect(replayed.gateway.budgetSnapshot().global).toMatchObject({
      spentUsd: 1,
      exhausted: true,
    });
  });

  test('invalid repository configuration never becomes a model correction', async () => {
    const replayed = replay([valid]);
    expect(
      await generatePatch({ ...replayed.options, rules: { ...rules, maxFilesChanged: 0 } }),
    ).toMatchObject({ ok: false });
    expect(replayed.requests).toHaveLength(0);
    expect(replayed.events).toHaveLength(0);
  });

  test('an audit outage after a valid response withholds the patch without a second model call', async () => {
    let handoffs = 0;
    const replayed = replay([valid], {}, async () => {
      handoffs++;
      throw new Error('audit down');
    });
    expect(await generatePatch(replayed.options)).toMatchObject({
      ok: false,
      error: { reasons: ['no patch source available: audit_unavailable'] },
    });
    expect(replayed.requests).toHaveLength(1);
    expect(handoffs).toBe(1);
  });
});
