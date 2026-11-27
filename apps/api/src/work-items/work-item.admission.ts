import { randomUUID } from 'node:crypto';
import { FIX_QUEUE_FRONT } from '@graveshift/core';
import {
  WorkError,
  assertFixEligible,
  decideTriage,
  type ClaimFix,
  type ClaimResult,
  type SaveTriage,
  type TriageSaveResult,
  type WorkCaller,
} from '@graveshift/work';
import type { Prisma } from '@prisma/client';

import type { AuditSink } from '../audit/audit.sink';
import { newLease } from './work-item.lease';
import { toAttempt, workAudit } from './work-item.mapper';
import type { WorkAgents } from './work-item.policy';
import { FIX_ATTEMPT_SELECT } from './work-item.select';
import {
  assertVersion,
  assertSavedVersion,
  commandReceipt,
  createReceipt,
  fenceWork,
  loadWork,
  recordedOutcome,
} from './work-item.state';

export async function saveTriage(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  agents: WorkAgents,
  caller: WorkCaller,
  id: string,
  input: SaveTriage,
): Promise<TriageSaveResult> {
  const request = { kind: 'triage' as const, body: input.body };
  const receipt = await commandReceipt(tx, caller, id, request);
  if (receipt !== null) {
    const outcome = recordedOutcome(receipt);
    if (outcome !== null) return { kind: 'replay', outcome };
    if (receipt.attemptId !== null) {
      throw new WorkError('COMMAND_IN_PROGRESS', 'This command already has a Fix attempt');
    }
    const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
    assertSavedVersion(snapshot, receipt);
    return { kind: 'saved', snapshot };
  }
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  assertVersion(snapshot, input.expectedVersion);
  if (caller.expectedVersion !== undefined) assertVersion(snapshot, caller.expectedVersion);
  if (snapshot.activeAttempt) throw new WorkError('ACTIVE_ATTEMPT', 'A Fix attempt is active');
  const decision = decideTriage(snapshot.item, input.body.assignee, agents);
  await fenceWork(tx, caller, id, snapshot, {
    assignee: decision.item.assignee,
  });
  await createReceipt(tx, caller, id, request, snapshot.version + 1);
  const next = await loadWork(tx, { projectId: caller.projectId, id });
  if (decision.trigger === null) {
    await tx.workCommand.update({
      where: { projectId_commandId: { projectId: caller.projectId, commandId: caller.commandId } },
      data: { result: { kind: 'triage', result: { item: next.item, autoFix: null } } },
      select: { commandId: true },
    });
  }
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'triaged', { version: next.version }),
  );
  return { kind: 'saved', snapshot: next };
}

export async function claimFix(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  agents: WorkAgents,
  caller: WorkCaller,
  id: string,
  input: ClaimFix,
): Promise<ClaimResult> {
  const receipt = await commandReceipt(tx, caller, id, input.command);
  if (receipt !== null) {
    const outcome = recordedOutcome(receipt);
    if (outcome !== null) return { kind: 'replay', outcome };
    if (receipt.attemptId !== null) {
      throw new WorkError('COMMAND_IN_PROGRESS', 'This command already has a Fix attempt');
    }
  }
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  assertVersion(snapshot, input.expectedVersion);
  if (receipt !== null) assertSavedVersion(snapshot, receipt);
  if (snapshot.activeAttempt) throw new WorkError('ACTIVE_ATTEMPT', 'A Fix attempt is active');
  const decision =
    input.command.kind === 'triage' && receipt === null
      ? decideTriage(snapshot.item, input.command.body.assignee, agents)
      : { item: snapshot.item };
  const trigger = input.command.kind === 'triage' ? 'auto_fix' : 'fix_now';
  const agent = assertFixEligible(decision.item, trigger, agents);
  const attemptId = randomUUID();
  await fenceWork(tx, caller, id, snapshot, {
    assignee: decision.item.assignee,
    activeAttemptId: attemptId,
    ...(trigger === 'fix_now' ? { fixPriority: FIX_QUEUE_FRONT } : {}),
  });
  const row = await tx.fixAttempt.create({
    data: {
      id: attemptId,
      projectId: caller.projectId,
      commandId: caller.commandId,
      workItemId: id,
      agent: agent.name,
      trigger,
      state: 'claimed',
      params: {},
      ...(await newLease(tx, caller)),
    },
    select: FIX_ATTEMPT_SELECT,
  });
  if (receipt === null)
    await createReceipt(tx, caller, id, input.command, snapshot.version + 1, attemptId);
  else
    await tx.workCommand.update({
      where: { projectId_commandId: { projectId: caller.projectId, commandId: caller.commandId } },
      data: { attemptId },
      select: { commandId: true },
    });
  const next = await loadWork(tx, { projectId: caller.projectId, id });
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'claimed', {
      version: next.version,
      attemptId,
      state: 'claimed',
    }),
  );
  return { kind: 'claimed', snapshot: next, attempt: toAttempt(row) };
}
