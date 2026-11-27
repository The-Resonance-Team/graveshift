import type { RoutingModel } from '@graveshift/agents/routing';
import type { Gateway } from '@graveshift/gateway';
import { z } from 'zod';

import { currentAuditScope } from './audit';
import { modelContext } from './model-context';

export function routingModel(gateway: Pick<Gateway, 'run'>): RoutingModel {
  return {
    async generateText(input) {
      // Checked before the model call: a routing call with no authenticated audit scope would
      // spend budget on a model call whose durable entry has no chain to belong to.
      if (currentAuditScope() === undefined) {
        return { status: 'unavailable', reason: 'audit_unavailable' };
      }
      const signal = modelContext()?.signal;
      const result = await gateway.run({
        agent: input.selectedAgent.name,
        task: 'route_work',
        system: input.system,
        prompt: input.prompt,
        schema: z.object({ question: z.string().min(1).max(10_000) }).strict(),
        validate: (value) => (value.question.length > 10_000 ? 'question is too long' : undefined),
        ...(signal === undefined ? {} : { signal }),
      });
      return result.status === 'ok'
        ? { status: 'ok', text: result.value.question }
        : { status: 'unavailable', reason: result.reason };
    },
  };
}
