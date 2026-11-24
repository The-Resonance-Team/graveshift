import type { AgentConfig } from '@graveshift/agents';
import { agentAssignee } from '@graveshift/core';
import {
  decideTriage,
  triageResult,
  WorkError,
  type ApplyAnswer,
  type BeginPublication,
  type ClaimFix,
  type ClaimResult,
  type FinishAttempt,
  type FixAttempt,
  type FixResult,
  type RecordPublication,
  type SaveQuestion,
  type SaveTriage,
  type WorkCaller,
  type WorkOutcome,
  type WorkRequest,
  type WorkRuntime,
  type WorkSnapshot,
} from '@graveshift/work';

import { at, diagnosis, item } from './flow-fixtures';
import { applyFlowAnswer } from './flow-answer';
import { flowAbandon, flowAbort, flowHeartbeat } from './flow-execution';

interface Receipt {
  request: WorkRequest;
  outcome: WorkOutcome | null;
  caller: WorkCaller;
  workVersion: number;
  attemptId: string | null;
}

/** An atomic in-memory state port for flow tests. Each method mutates before its promise resolves. */
export class FlowRuntime implements WorkRuntime {
  snapshot: WorkSnapshot = { item: item(), version: 0, diagnosis };
  readonly receipts = new Map<string, Receipt>();
  readonly calls: string[] = [];
  failRecord = false;
  failFinish = false;
  expired = false;
  private sequence = 0;
  readonly agents: readonly AgentConfig[];
  constructor(agents: readonly AgentConfig[]) {
    this.agents = agents;
  }

  async read() {
    this.calls.push('read');
    return structuredClone(this.snapshot);
  }

  async replay(caller: WorkCaller, _id: string, request: WorkRequest) {
    const receipt = this.receipts.get(caller.commandId);
    if (receipt === undefined) return null;
    if (
      JSON.stringify(receipt.request) !== JSON.stringify(request) ||
      receipt.caller.projectId !== caller.projectId ||
      receipt.caller.actor !== caller.actor ||
      receipt.caller.expectedVersion !== caller.expectedVersion
    )
      throw new WorkError('COMMAND_CONFLICT', 'Command changed');
    if (receipt.outcome === null && receipt.attemptId !== null)
      throw new WorkError('COMMAND_IN_PROGRESS', 'Command is still running');
    return structuredClone(receipt.outcome);
  }

  async saveTriage(caller: WorkCaller, _id: string, input: SaveTriage) {
    const request = { kind: 'triage' as const, body: input.body };
    const receipt = this.receipts.get(caller.commandId);
    if (receipt !== undefined) {
      const outcome = await this.replay(caller, _id, request);
      if (outcome !== null) return { kind: 'replay' as const, outcome };
      this.fence(receipt.workVersion);
      return { kind: 'saved' as const, snapshot: structuredClone(this.snapshot) };
    }
    this.fence(input.expectedVersion);
    if (caller.expectedVersion !== undefined) this.fence(caller.expectedVersion);
    this.calls.push('saveTriage');
    const decision = decideTriage(this.snapshot.item, input.body.assignee, this.agents);
    this.snapshot = { ...this.snapshot, item: decision.item, version: this.snapshot.version + 1 };
    this.receipts.set(caller.commandId, {
      request: { kind: 'triage', body: input.body },
      caller,
      workVersion: this.snapshot.version,
      attemptId: null,
      outcome:
        decision.trigger === null
          ? { kind: 'triage', result: { item: decision.item, autoFix: null } }
          : null,
    });
    return { kind: 'saved' as const, snapshot: structuredClone(this.snapshot) };
  }

  async claim(caller: WorkCaller, _id: string, input: ClaimFix): Promise<ClaimResult> {
    const receipt = this.receipts.get(caller.commandId);
    if (receipt !== undefined) {
      const outcome = await this.replay(caller, _id, input.command);
      if (outcome !== null) return { kind: 'replay', outcome };
      this.fence(receipt.workVersion);
    }
    this.fence(input.expectedVersion);
    if (this.snapshot.activeAttempt)
      throw new WorkError('ACTIVE_ATTEMPT', 'Attempt already active');
    this.calls.push('claim');
    const attempt: FixAttempt = {
      id: `attempt-${++this.sequence}`,
      projectId: caller.projectId,
      workItemId: this.snapshot.item.id,
      commandId: caller.commandId,
      workerId: caller.workerId ?? null,
      leaseUntil: caller.workerId === undefined ? null : '2099-01-01T00:00:00.000Z',
      agent:
        this.agents.find(
          (configured) => agentAssignee(configured.name) === this.snapshot.item.assignee,
        )?.name ?? '',
      trigger: input.command.kind === 'triage' ? 'auto_fix' : 'fix_now',
      state: 'claimed',
      routingProgress: null,
      params: {},
      questionId: null,
      result: null,
      publication: null,
      baseSha: null,
      version: 0,
      createdAt: at,
      updatedAt: at,
    };
    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      activeAttempt: attempt,
    };
    this.receipts.set(caller.commandId, {
      request: input.command,
      outcome: null,
      caller,
      workVersion: receipt?.workVersion ?? this.snapshot.version,
      attemptId: attempt.id,
    });
    return this.claimed();
  }

  async saveQuestion(caller: WorkCaller, _id: string, input: SaveQuestion): Promise<FixResult> {
    const attempt = this.active(input);
    this.calls.push('saveQuestion');
    const result: FixResult = {
      item: this.snapshot.item,
      trigger: attempt.trigger,
      effect: 'deny',
      ok: false,
      pr: null,
      reason: 'awaiting_answer',
      failure: 'awaiting_answer',
      attemptId: attempt.id,
      routing: {
        kind: 'ask',
        agent: input.progress.selectedAgent,
        questionId: `${attempt.id}:question`,
        question: input.progress.question,
        missing: input.progress.missing,
      },
    };
    this.update({
      ...attempt,
      state: 'awaiting_answer',
      routingProgress: input.progress,
      params: input.progress.params,
      questionId: `${attempt.id}:question`,
      result,
    });
    this.record(caller, result);
    return structuredClone(result);
  }

  async applyAnswer(caller: WorkCaller, _id: string, input: ApplyAnswer): Promise<ClaimResult> {
    return applyFlowAnswer(this, caller, _id, input);
  }

  heartbeat: WorkRuntime['heartbeat'] = (...args) => flowHeartbeat(this, ...args);
  abandon: WorkRuntime['abandon'] = (...args) => flowAbandon(this, ...args);
  abortPublication: WorkRuntime['abortPublication'] = (...args) => flowAbort(this, ...args);

  async beginPublication(_caller: WorkCaller, _id: string, input: BeginPublication) {
    const attempt = this.active(input);
    this.update({
      ...attempt,
      state: 'publishing',
      publication: input.intent,
      baseSha: input.intent.baseSha,
    });
    return structuredClone(this.snapshot);
  }

  async recordPublication(_caller: WorkCaller, _id: string, input: RecordPublication) {
    if (this.failRecord) throw new Error('State storage failed');
    const attempt = this.active(input);
    this.calls.push('recordPublication');
    this.snapshot.item = { ...this.snapshot.item, draftPr: input.pr };
    this.update({ ...attempt, publication: input.pr });
    return structuredClone(this.snapshot);
  }

  async finish(caller: WorkCaller, _id: string, input: FinishAttempt): Promise<FixResult> {
    if (this.failFinish) throw new Error('Finish failed');
    const attempt = this.active(input);
    this.calls.push('finish');
    const result: FixResult = {
      ...input.outcome,
      item: this.snapshot.item,
      trigger: attempt.trigger,
      attemptId: attempt.id,
    };
    this.record(caller, result);
    this.snapshot.version++;
    if (input.state === 'uncertain') this.update({ ...attempt, state: 'uncertain', result });
    else delete this.snapshot.activeAttempt;
    return structuredClone(result);
  }

  private fence(version: number) {
    if (this.snapshot.version !== version) throw new WorkError('STATE_CHANGED', 'State changed');
  }
  active(input: { expectedVersion: number; attemptId: string; attemptVersion: number }) {
    this.fence(input.expectedVersion);
    const attempt = this.snapshot.activeAttempt;
    if (!attempt || attempt.id !== input.attemptId || attempt.version !== input.attemptVersion)
      throw new WorkError('STATE_CHANGED', 'Attempt changed');
    return attempt;
  }
  update(attempt: FixAttempt) {
    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      activeAttempt: { ...attempt, version: attempt.version + 1 },
    };
  }
  claimed(): Extract<ClaimResult, { kind: 'claimed' }> {
    const attempt = this.snapshot.activeAttempt;
    if (!attempt) throw new Error('Missing fixture attempt');
    return {
      kind: 'claimed',
      snapshot: structuredClone(this.snapshot),
      attempt: structuredClone(attempt),
    };
  }
  private record(caller: WorkCaller, result: FixResult) {
    const receipt = this.receipts.get(caller.commandId);
    if (!receipt) throw new Error('Missing command receipt');
    receipt.outcome =
      receipt.request.kind === 'triage'
        ? { kind: 'triage', result: triageResult(result) }
        : { kind: 'fix', result };
  }
}
