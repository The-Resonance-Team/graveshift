import { createGateway, type ModelAdapter } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import type { PrivateApi } from './api-client';
import { createAudit, gatewayAudit } from './audit';
import { agent } from './flow-fixtures';

const selected = agent();
const adapter: ModelAdapter = {
  provider: selected.provider,
  model: selected.model,
  capability: 'structured_language',
  available: () => true,
  async generateObject() {
    return { object: { accepted: true }, model: selected.model, usage: { in: 1, out: 1 } };
  },
};
const config = {
  globalDailyBudgetUsd: 1,
  maxRetries: 0,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 1 } },
};
const run = (gateway: ReturnType<typeof createGateway>) =>
  gateway.run({
    agent: selected.name,
    task: 'diagnose',
    system: 'diagnose',
    prompt: 'p',
    schema: z.object({ accepted: z.boolean() }).strict(),
    validate: () => undefined,
  });
const apiReturning = (key: string): PrivateApi => ({
  get: async () => {
    throw new Error('unused');
  },
  post: async <Value>(_path: string, _body: unknown, schema: z.ZodType<Value>) =>
    schema.parse({ key }),
});

describe('durable model audit acknowledgement', () => {
  test('the gateway withholds the model result when the durable write fails', async () => {
    const gateway = createGateway({
      agents: [{ agent: selected, adapter }],
      config,
      onAudit: gatewayAudit(async () => {
        throw new Error('database down');
      }),
    });
    expect(await run(gateway)).toMatchObject({
      status: 'unavailable',
      reason: 'audit_unavailable',
    });
  });

  test('the gateway withholds the model result when the API acknowledges another key', async () => {
    const gateway = createGateway({
      agents: [{ agent: selected, adapter }],
      config,
      onAudit: gatewayAudit(createAudit(apiReturning('gateway:other'), 'local')),
    });
    expect(await run(gateway)).toMatchObject({
      status: 'unavailable',
      reason: 'audit_unavailable',
    });
  });

  test('the gateway releases a result only after the API acknowledges its key', async () => {
    const posted: unknown[] = [];
    const api: PrivateApi = {
      get: async () => {
        throw new Error('unused');
      },
      post: async <Value>(path: string, body: unknown, schema: z.ZodType<Value>) => {
        posted.push({ path, body });
        const draft = (body as { draft: { key: string } }).draft;
        return schema.parse({ key: draft.key });
      },
    };
    const direct = createGateway({
      agents: [{ agent: selected, adapter }],
      config,
      onAudit: gatewayAudit(createAudit(api, 'local')),
    });
    const result = await run(direct);
    expect(result.status).toBe('ok');
    expect(posted).toMatchObject([
      { path: '/internal/audit', body: { projectId: 'local', draft: { type: 'model.call' } } },
    ]);
  });
});
