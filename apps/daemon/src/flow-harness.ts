import type { AgentConfig } from '@graveshift/agents';
import type { AuditDraft } from '@graveshift/core';
import { createGateway, type ModelAdapter } from '@graveshift/gateway';
import { PatchSchema } from '@graveshift/patch';

import { currentAuditScope, gatewayAudit, type AuditScope } from './audit';
import { ExecutionFailure } from './execution';
import { agent, caller, context, policy, pr } from './flow-fixtures';
import { FlowRuntime } from './flow-runtime';
import { routingModel } from './routing-model';
import { createWorkCommands, type WorkFlowOptions } from './work-flow';

const TEST_BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TEST_BLOB_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export function harness(agents: AgentConfig[] = [agent()]) {
  const runtime = new FlowRuntime(agents);
  // The durable record, as the real writer shapes it: one chain key per append, and a write
  // with no authenticated scope is refused instead of saved.
  const audit: Array<AuditDraft & { projectId: string }> = [];
  const effects: string[] = [];
  // One ordered record of both kinds of side effect, so a test can prove an audit write
  // happened before an outside call instead of comparing two arrays and assuming.
  const events: string[] = [];
  const requests: string[] = [];
  const failTypes = new Set<string>();
  let failAudit = false;
  const write = async (draft: AuditDraft, scope?: AuditScope) => {
    const bound = scope ?? currentAuditScope();
    if (bound === undefined) throw new Error('An audit entry needs the authenticated scope');
    if (failAudit && draft.type === 'model.call') throw new Error('Durable audit unavailable');
    if (failTypes.has(draft.type)) throw new Error(`Durable audit unavailable: ${draft.type}`);
    audit.push({ ...draft, projectId: bound.projectId });
    events.push(`audit:${draft.type}`);
  };
  const gateway = createGateway({
    agents: agents.map((configured) => {
      const adapter: ModelAdapter = {
        provider: configured.provider,
        model: configured.model,
        capability: 'structured_language',
        available: () => true,
        async generateObject(request) {
          requests.push(configured.name);
          const object = request.prompt.includes('Required params:')
            ? { question: 'Which version should be fixed?' }
            : {
                baseSha: TEST_BASE_SHA,
                files: [
                  {
                    path: 'src/main.ts',
                    content: 'fixed',
                    linesChanged: 1,
                    baseBlobSha: TEST_BLOB_SHA,
                  },
                ],
              };
          return { object, model: configured.model, usage: { in: 10, out: 10 } };
        },
      };
      return { agent: configured, adapter };
    }),
    config: {
      globalDailyBudgetUsd: 100,
      maxRetries: 0,
      timeoutMs: 1000,
      priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 2 } },
    },
    onAudit: gatewayAudit(write),
  });
  const options: WorkFlowOptions = {
    projectId: caller.projectId,
    runtime,
    agents,
    policy,
    audit: write,
    context: async () => {
      effects.push('context');
      events.push('context');
      return context();
    },
    model: routingModel(gateway),
    execute: async (input) => {
      effects.push(`source:${input.agent.name}`);
      events.push(`source:${input.agent.name}`);
      const patch = await gateway.run({
        agent: input.agent.name,
        task: 'generate_patch',
        system: input.prompt,
        prompt: input.context.diagnosis.rootCause,
        schema: PatchSchema,
        validate: () => undefined,
      });
      if (patch.status !== 'ok')
        throw new ExecutionFailure(
          patch.status === 'unavailable' && patch.reason === 'audit_unavailable'
            ? 'audit_failed'
            : 'patch_rejected',
          'Patch unavailable',
        );
      return {
        intent: { repo: pr.repo, branch: pr.branch, baseSha: 'base-1' },
        publish: async () => {
          effects.push('publish');
          events.push('publish');
          return pr;
        },
        dispose: async () => {
          effects.push('dispose');
          events.push('dispose');
        },
      };
    },
    recover: async () => undefined,
  };
  return {
    runtime,
    audit,
    effects,
    events,
    requests,
    options,
    commands: () => createWorkCommands(options),
    failAudit: () => {
      failAudit = true;
    },
    /** Makes the durable append of one audit type fail, so a test can exercise one stage. */
    failAuditOf: (type: string) => {
      failTypes.add(type);
    },
  };
}
