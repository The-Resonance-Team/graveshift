import {
  createRoutingAgent,
  type RoutingModel,
  type RoutingResult,
} from '@graveshift/agents/routing';
import type { AgentConfig } from '@graveshift/agents';
import { decide, toAuditEvent, type Policy } from '@graveshift/policy';
import {
  WorkError,
  type ClaimResult,
  type FixCompletion,
  type FixFailure,
  type FixResult,
  type RoutingOutcome,
  type WorkCaller,
  type WorkRuntime,
} from '@graveshift/work';

import type { WriteAudit } from './audit';
import { ExecutionFailure, type FixExecutor } from './execution';
import { ContextFailure, type ResolveContext } from './fix-context';
import { publishFix } from './publication';
import type { RecoverFix } from './recovery';
import { withModelContext } from './model-context';
import { withAttemptLease } from './attempt-lifetime';

export interface FixOptions {
  agents: readonly AgentConfig[];
  runtime: WorkRuntime;
  policy: Policy;
  context: ResolveContext;
  model: RoutingModel;
  audit: WriteAudit;
  execute: FixExecutor;
  recover: RecoverFix;
}

export function failed(
  failure: Exclude<FixFailure, 'none'>,
  reason: string = failure,
): FixCompletion {
  return { effect: 'deny', ok: false, pr: null, reason, failure, routing: null };
}

export async function runFix(
  options: FixOptions,
  caller: WorkCaller,
  claim: Extract<ClaimResult, { kind: 'claimed' }>,
): Promise<FixResult> {
  return withAttemptLease(
    options.runtime,
    caller,
    claim.snapshot.item.id,
    claim.attempt.id,
    (signal) => runOwnedFix(options, caller, claim, signal),
  );
}

async function runOwnedFix(
  options: FixOptions,
  caller: WorkCaller,
  claim: Extract<ClaimResult, { kind: 'claimed' }>,
  signal: AbortSignal,
): Promise<FixResult> {
  const { snapshot, attempt } = claim;
  const id = snapshot.item.id;
  const fence = {
    expectedVersion: snapshot.version,
    attemptId: attempt.id,
    attemptVersion: attempt.version,
  };
  const finish = (outcome: FixCompletion, state: 'failed' | 'needs_human' = 'failed') => {
    signal.throwIfAborted();
    return options.runtime.finish(caller, id, { ...fence, state, outcome });
  };
  const agent = options.agents.find((entry) => entry.name === attempt.agent);
  if (agent === undefined || snapshot.item.assignee !== `needs_agent_${attempt.agent}`) {
    return finish(failed('routing_failed', 'The assigned Agent is unavailable'));
  }
  let context;
  try {
    context = await options.context(caller, snapshot);
  } catch (error) {
    signal.throwIfAborted();
    return finish(failed(error instanceof ContextFailure ? error.failure : 'context_unavailable'));
  }
  signal.throwIfAborted();
  const decision = decide(options.policy, context.policy, { name: 'open_pr' });
  try {
    await options.audit({
      key: `fix:${attempt.id}:policy:${attempt.version}`,
      incidentId: context.incident.id,
      ...toAuditEvent(decision, context.policy, { name: 'open_pr' }),
    });
  } catch {
    return finish(failed('audit_failed'));
  }
  signal.throwIfAborted();
  if (decision.effect !== 'allow') {
    return finish({ ...failed('policy_denied', decision.reason), effect: decision.effect });
  }
  const routing = createRoutingAgent({ agents: options.agents, model: options.model });
  let routed: RoutingResult;
  try {
    routed = await withModelContext(
      { incidentId: context.incident.id, service: context.incident.service, signal },
      async () =>
        attempt.routingProgress === null
          ? await routing.begin({
              attemptId: attempt.id,
              selectedAgent: attempt.agent,
              text: `${snapshot.item.title}\n${snapshot.item.description}\n${context.diagnosis.rootCause}`,
              params: attempt.params,
            })
          : await routing.resume({ progress: attempt.routingProgress, params: attempt.params }),
    );
  } catch {
    return finish(failed('routing_failed'));
  }
  signal.throwIfAborted();
  if (routed.kind === 'ask') {
    return options.runtime.saveQuestion(caller, id, { ...fence, progress: routed.progress });
  }
  if (routed.kind === 'needs_human') {
    if (routed.reason === 'audit_unavailable') return finish(failed('audit_failed'));
    return finish(
      {
        ...failed('needs_human', routed.reason),
        routing: {
          kind: 'needs_human',
          agent: attempt.agent,
          reason: routed.reason,
          missing: routed.missing,
        },
      },
      'needs_human',
    );
  }
  const outcome: RoutingOutcome = {
    kind: 'routed',
    agent: { name: routed.agent.name, slug: routed.agent.slug },
  };
  try {
    const prepared = await withModelContext(
      { incidentId: context.incident.id, service: context.incident.service, signal },
      () =>
        options.execute({
          caller,
          snapshot,
          attempt,
          context,
          agent: routed.agent,
          prompt: routed.prompt,
          signal,
        }),
    );
    signal.throwIfAborted();
    return await publishFix(options, caller, claim, prepared, outcome, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof WorkError) throw error;
    return finish({
      ...failed(error instanceof ExecutionFailure ? error.failure : 'fix_error'),
      routing: outcome,
    });
  }
}
