import type { AuditDraft } from '@graveshift/core';
import { createGateway, type ModelAdapter } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { gatewayAudit } from './audit';
import { agent, caller } from './flow-fixtures';
import { harness } from './flow-harness';
import { withModelContext } from './model-context';

describe('model audit context', () => {
  test('concurrent Hauntings retain their own metadata with one gateway budget owner', async () => {
    const saved: AuditDraft[] = [];
    const first = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const selected = agent();
    const adapter: ModelAdapter = {
      provider: selected.provider,
      model: selected.model,
      capability: 'structured_language',
      available: () => true,
      async generateObject(request) {
        if (request.prompt === 'first') {
          entered.resolve();
          await first.promise;
        }
        return { object: { accepted: true }, model: selected.model, usage: { in: 10, out: 5 } };
      },
    };
    const gateway = createGateway({
      agents: [{ agent: selected, adapter }],
      config: {
        globalDailyBudgetUsd: 1,
        maxRetries: 0,
        timeoutMs: 1000,
        priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 1 } },
      },
      onAudit: gatewayAudit(async (draft) => {
        saved.push(draft);
      }),
    });
    const run = (prompt: string) =>
      gateway.run({
        agent: selected.name,
        task: 'diagnose',
        system: 'diagnose',
        prompt,
        schema: z.object({ accepted: z.boolean() }).strict(),
        validate: () => undefined,
      });
    const pending = withModelContext({ incidentId: 'haunting-a', service: 'checkout' }, () =>
      run('first'),
    );
    await entered.promise;
    const second = await withModelContext({ incidentId: 'haunting-b', service: 'worker' }, () =>
      run('second'),
    );
    first.resolve();
    const one = await pending;
    expect(saved).toMatchObject([
      {
        key: `gateway:${second.callId}`,
        type: 'model.call',
        incidentId: 'haunting-b',
        payload: { service: 'worker', task: 'diagnose', tokensIn: 10, tokensOut: 5 },
      },
      {
        key: `gateway:${one.callId}`,
        type: 'model.call',
        incidentId: 'haunting-a',
        payload: { service: 'checkout', task: 'diagnose', tokensIn: 10, tokensOut: 5 },
      },
    ]);
    expect(gateway.budgetSnapshot().global.spentUsd).toBeCloseTo(0.00003);
  });

  test('routing and patch audits carry the verified Haunting context', async () => {
    const flow = harness([agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })]);
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    const routing = flow.audit.find((entry) => entry.type === 'model.call');
    expect(routing).toMatchObject({
      incidentId: 'incident-1',
      payload: { service: 'checkout', task: 'route_work' },
    });
    if (result.routing?.kind !== 'ask' || result.attemptId === null)
      throw new Error('Expected a saved question');
    await flow.commands().answer({ ...caller, commandId: 'answer' }, 'work-1', {
      attemptId: result.attemptId,
      questionId: result.routing.questionId,
      params: { VERSION: 'v2' },
    });
    const patch = flow.audit.filter((entry) => entry.type === 'model.call')[1];
    expect(patch).toMatchObject({
      incidentId: 'incident-1',
      payload: { service: 'checkout', task: 'generate_patch' },
    });
  });
});
