import type { AuditDraft } from '@graveshift/core';
import { createGateway, type ModelAdapter } from '@graveshift/gateway';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { gatewayAudit } from './audit';
import { setupFlow } from './flow.fixture';
import { agent, caller, withFixAuditScope } from './flow-fixtures';
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
    // Each Haunting runs as its own authenticated unit of work, as a command does.
    const pending = withFixAuditScope(() =>
      withModelContext({ incidentId: 'haunting-a', service: 'checkout' }, () => run('first')),
    );
    await entered.promise;
    const second = await withFixAuditScope(() =>
      withModelContext({ incidentId: 'haunting-b', service: 'worker' }, () => run('second')),
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
});

describe.skipIf(!dbTestEnabled)('model audit context over Postgres', () => {
  let flow: Awaited<ReturnType<typeof setupFlow>>;
  beforeEach(async () => {
    flow = await setupFlow({
      agents: [agent({ prompt: 'Fix {{VERSION}}', params: [{ VERSION: '' }] })],
    });
  });
  afterEach(async () => {
    await flow?.close();
  });

  test('routing and patch audits carry the verified Haunting context', async () => {
    const result = await flow.commands().fixNow(caller, 'work-1', {});
    const entries = await flow.platform.audit.list(caller.projectId);
    const routing = entries.find((entry) => entry.payload.task === 'route_work');
    expect(routing).toMatchObject({
      type: 'model.call',
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
    const patch = (await flow.platform.audit.list(caller.projectId)).find(
      (entry) => entry.payload.task === 'generate_patch',
    );
    expect(patch).toMatchObject({
      incidentId: 'incident-1',
      payload: { service: 'checkout', task: 'generate_patch' },
    });
  });
});
