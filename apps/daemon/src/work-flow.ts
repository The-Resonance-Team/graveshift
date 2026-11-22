import type { AgentConfig } from '@graveshift/agents';
import {
  assertFixEligible,
  decideTriage,
  triageResult,
  WorkError,
  type FixResult,
  type WorkCaller,
  type WorkCommands,
  type WorkOutcome,
  type WorkRuntime,
} from '@graveshift/work';

import { withAuditScope } from './audit';
import { auditScopeOfCaller } from './fix-audit';
import { runFix, type FixOptions } from './run-fix';
import { replayWork } from './recovery';

export interface WorkFlowOptions extends FixOptions {
  projectId: string;
  agents: readonly AgentConfig[];
  runtime: WorkRuntime;
  workerId?: string;
}

function fixResult(outcome: WorkOutcome): FixResult {
  if (outcome.kind !== 'fix') throw new WorkError('INVALID_OUTCOME', 'Invalid command outcome');
  return outcome.result;
}

export function createWorkCommands(options: WorkFlowOptions): WorkCommands {
  const { runtime, agents } = options;
  const workerId = options.workerId ?? crypto.randomUUID();
  const verify = (caller: WorkCaller) => {
    if (caller.projectId !== options.projectId) {
      throw new WorkError('PROJECT_FORBIDDEN', 'Work item belongs to another project');
    }
  };
  const commands: WorkCommands = {
    async triage(caller, id, body) {
      verify(caller);
      const request = { kind: 'triage' as const, body };
      const replay = await replayWork(options, caller, id, request);
      if (replay !== null) {
        if (replay.kind !== 'triage')
          throw new WorkError('INVALID_OUTCOME', 'Invalid triage outcome');
        return replay.result;
      }
      const snapshot = await runtime.read({ projectId: caller.projectId, id });
      const decision = decideTriage(snapshot.item, body.assignee, agents);
      const saved = await runtime.saveTriage(caller, id, {
        expectedVersion: snapshot.version,
        body,
      });
      if (saved.kind === 'replay') {
        if (saved.outcome.kind !== 'triage')
          throw new WorkError('INVALID_OUTCOME', 'Invalid triage outcome');
        return saved.outcome.result;
      }
      if (decision.trigger === null) return { item: saved.snapshot.item, autoFix: null };
      assertFixEligible(saved.snapshot.item, decision.trigger, agents);
      const claim = await runtime.claim(caller, id, {
        expectedVersion: saved.snapshot.version,
        command: request,
      });
      if (claim.kind === 'replay') {
        if (claim.outcome.kind !== 'triage')
          throw new WorkError('INVALID_OUTCOME', 'Invalid triage outcome');
        return claim.outcome.result;
      }
      return triageResult(await runFix(options, caller, claim));
    },
    async fixNow(caller, id, body) {
      verify(caller);
      const request = { kind: 'fix_now' as const, body };
      const replay = await replayWork(options, caller, id, request);
      if (replay !== null) return fixResult(replay);
      const snapshot = await runtime.read({ projectId: caller.projectId, id });
      assertFixEligible(snapshot.item, 'fix_now', agents);
      const claim = await runtime.claim(caller, id, {
        expectedVersion: snapshot.version,
        command: request,
      });
      if (claim.kind === 'replay') return fixResult(claim.outcome);
      return runFix(options, caller, claim);
    },
    async answer(caller, id, body) {
      verify(caller);
      const replay = await replayWork(options, caller, id, { kind: 'answer', body });
      if (replay !== null) return fixResult(replay);
      const snapshot = await runtime.read({ projectId: caller.projectId, id });
      const attempt = snapshot.activeAttempt;
      if (attempt === undefined || attempt.id !== body.attemptId) {
        throw new WorkError('ATTEMPT_NOT_FOUND', 'The Fix attempt does not exist');
      }
      if (attempt.state !== 'awaiting_answer' || attempt.questionId !== body.questionId) {
        throw new WorkError('QUESTION_NOT_PENDING', 'This question is not awaiting an answer');
      }
      assertFixEligible(snapshot.item, attempt.trigger, agents);
      const claim = await runtime.applyAnswer(caller, id, {
        expectedVersion: snapshot.version,
        attemptVersion: attempt.version,
        body,
      });
      if (claim.kind === 'replay') return fixResult(claim.outcome);
      return runFix(options, caller, claim);
    },
  };
  // Every command runs under the audit scope of its authenticated caller. The Fix attempt it
  // starts writes its entries to that Project's chain, and the shared gateway attributes its
  // model calls to the same binding instead of any deployment-wide project.
  const underScope =
    <Body, Value>(run: (caller: WorkCaller, id: string, body: Body) => Promise<Value>) =>
    (caller: WorkCaller, id: string, body: Body): Promise<Value> => {
      const authenticated = { ...caller, workerId };
      return withAuditScope(auditScopeOfCaller(authenticated), () => run(authenticated, id, body));
    };
  return {
    triage: underScope(commands.triage),
    fixNow: underScope(commands.fixNow),
    answer: underScope(commands.answer),
  };
}
