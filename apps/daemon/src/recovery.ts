import { PrRefSchema, type PrRef } from '@graveshift/core';
import {
  PublicationIntentSchema,
  triageResult,
  WorkError,
  type FixResult,
  type PublicationIntent,
  type WorkCaller,
  type WorkOutcome,
  type WorkRequest,
} from '@graveshift/work';

import type { FixOptions } from './run-fix';

export type RecoverFix = (intent: PublicationIntent) => Promise<PrRef | undefined>;

async function reconcile(
  options: FixOptions,
  caller: WorkCaller,
  id: string,
  prior: WorkOutcome,
): Promise<WorkOutcome> {
  const failure = prior.kind === 'fix' ? prior.result.failure : prior.result.autoFix?.failure;
  if (failure !== 'publication_uncertain') return prior;
  try {
    let snapshot = await options.runtime.read({ projectId: caller.projectId, id });
    const initial = snapshot.activeAttempt;
    if (
      initial === undefined ||
      !['publishing', 'uncertain'].includes(initial.state) ||
      initial.baseSha === null
    )
      return prior;
    let attempt = initial;
    const fence = () => ({
      expectedVersion: snapshot.version,
      attemptId: attempt.id,
      attemptVersion: attempt.version,
    });
    const recorded = PrRefSchema.safeParse(attempt.publication);
    let pr = recorded.success ? recorded.data : undefined;
    if (pr === undefined) {
      const intent = PublicationIntentSchema.parse(attempt.publication);
      await options.audit({
        key: `fix:${attempt.id}:recover:${crypto.randomUUID()}`,
        actor: attempt.agent,
        type: 'fix.reconciliation',
        ...(snapshot.diagnosis === undefined ? {} : { incidentId: snapshot.diagnosis.incidentId }),
        payload: {
          workItemId: id,
          attemptId: attempt.id,
          service: snapshot.item.service,
          ...intent,
        },
      });
      pr = await options.recover(intent);
      if (pr === undefined || pr.repo !== intent.repo || pr.branch !== intent.branch) return prior;
    }
    const baseSha = initial.baseSha;
    snapshot = await options.runtime.recordPublication(caller, id, { ...fence(), pr, baseSha });
    const updated = snapshot.activeAttempt;
    if (updated === undefined || updated.id !== attempt.id) return prior;
    attempt = updated;
    const result = await options.runtime.finish(caller, id, {
      ...fence(),
      state: 'completed',
      outcome: {
        effect: 'allow',
        ok: true,
        pr,
        reason: null,
        failure: 'none',
        routing:
          prior.kind === 'fix' ? prior.result.routing : (prior.result.autoFix?.routing ?? null),
      },
    });
    return prior.kind === 'triage'
      ? { kind: 'triage', result: triageResult(result) }
      : { kind: 'fix', result };
  } catch {
    return prior;
  }
}

export async function replayWork(
  options: FixOptions,
  caller: WorkCaller,
  id: string,
  request: WorkRequest,
): Promise<WorkOutcome | null> {
  let replay: WorkOutcome | null;
  try {
    replay = await options.runtime.replay(caller, id, request);
  } catch (error) {
    if (!(error instanceof WorkError) || error.code !== 'COMMAND_IN_PROGRESS') throw error;
    const snapshot = await options.runtime.read({ projectId: caller.projectId, id });
    const attempt = snapshot.activeAttempt;
    if (
      attempt !== undefined &&
      attempt.publication === null &&
      ['claimed', 'running'].includes(attempt.state)
    ) {
      const result = await options.runtime.abandon(caller, id, {
        expectedVersion: snapshot.version,
        attemptId: attempt.id,
        attemptVersion: attempt.version,
      });
      return request.kind === 'triage'
        ? { kind: 'triage', result: triageResult(result) }
        : { kind: 'fix', result };
    }
    if (
      attempt === undefined ||
      attempt.publication === null ||
      !['publishing', 'uncertain'].includes(attempt.state)
    )
      throw error;
    const result: FixResult = {
      item: snapshot.item,
      trigger: attempt.trigger,
      attemptId: attempt.id,
      effect: 'allow',
      ok: false,
      pr: snapshot.item.draftPr,
      failure: 'publication_uncertain',
      reason: 'Publication needs reconciliation',
      routing: null,
    };
    replay =
      request.kind === 'triage'
        ? { kind: 'triage', result: triageResult(result) }
        : { kind: 'fix', result };
  }
  return replay === null ? null : reconcile(options, caller, id, replay);
}
