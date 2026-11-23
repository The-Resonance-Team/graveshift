import {
  WorkError,
  WorkOutcomeSchema,
  type CanonicalWorkRef,
  type FixAttempt,
  type WorkCaller,
  type WorkOutcome,
  type WorkRequest,
  type WorkSnapshot,
} from '@graveshift/work';
import type { Prisma } from '@prisma/client';

import { requestHash, toSnapshot } from './work-item.mapper';
import {
  FIX_ATTEMPT_SELECT,
  WORK_COMMAND_SELECT,
  WORK_ITEM_SELECT,
  type CommandRow,
} from './work-item.select';

export async function loadWork(
  tx: Prisma.TransactionClient,
  ref: CanonicalWorkRef,
): Promise<WorkSnapshot> {
  const row = await tx.workItem.findFirst({ where: ref, select: WORK_ITEM_SELECT });
  if (row === null) throw new WorkError('WORK_NOT_FOUND', 'This Work item does not exist');
  const attempt =
    row.activeAttemptId === null
      ? null
      : await tx.fixAttempt.findFirst({
          where: { id: row.activeAttemptId, projectId: ref.projectId, workItemId: ref.id },
          select: FIX_ATTEMPT_SELECT,
        });
  return toSnapshot(row, attempt ?? undefined);
}

export async function commandReceipt(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  request?: WorkRequest,
): Promise<CommandRow | null> {
  const row = await tx.workCommand.findUnique({
    where: { projectId_commandId: { projectId: caller.projectId, commandId: caller.commandId } },
    select: WORK_COMMAND_SELECT,
  });
  if (
    row &&
    (row.workItemId !== id ||
      row.actor !== caller.actor ||
      (request !== undefined && row.requestHash !== requestHash(caller, id, request)))
  ) {
    throw new WorkError('COMMAND_CONFLICT', 'This command ID was used for different content');
  }
  return row;
}

export function recordedOutcome(row: CommandRow): WorkOutcome | null {
  return row.result === null ? null : WorkOutcomeSchema.parse(row.result);
}

export async function createReceipt(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  request: WorkRequest,
  workVersion: number,
  attemptId?: string,
): Promise<void> {
  await tx.workCommand.create({
    data: {
      projectId: caller.projectId,
      commandId: caller.commandId,
      workItemId: id,
      actor: caller.actor,
      kind: request.kind,
      requestHash: requestHash(caller, id, request),
      workVersion,
      ...(attemptId === undefined ? {} : { attemptId }),
    },
    select: { commandId: true },
  });
}

export function assertVersion(snapshot: WorkSnapshot, expected: number): void {
  if (snapshot.version !== expected) changedState();
}

export function changedState(): never {
  throw new WorkError('STATE_CHANGED', 'The Work item changed. Read its current state');
}

export function assertSavedVersion(snapshot: WorkSnapshot, receipt: CommandRow): void {
  if (receipt.workVersion === null) changedState();
  assertVersion(snapshot, receipt.workVersion);
}

export function activeAttempt(
  snapshot: WorkSnapshot,
  input: { attemptId: string; attemptVersion: number; expectedVersion: number },
  states: readonly FixAttempt['state'][],
): FixAttempt {
  assertVersion(snapshot, input.expectedVersion);
  const attempt = snapshot.activeAttempt;
  if (
    attempt === undefined ||
    attempt.id !== input.attemptId ||
    attempt.version !== input.attemptVersion ||
    !states.includes(attempt.state)
  )
    changedState();
  return attempt;
}

export async function fenceWork(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  snapshot: WorkSnapshot,
  data: Prisma.WorkItemUpdateManyMutationInput,
): Promise<void> {
  const changed = await tx.workItem.updateMany({
    where: {
      projectId: caller.projectId,
      id,
      version: snapshot.version,
      status: snapshot.item.status,
      activeAttemptId: snapshot.activeAttempt?.id ?? null,
    },
    data: { ...data, version: { increment: 1 } },
  });
  if (changed.count !== 1) changedState();
}

export async function fenceAttempt(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  attempt: FixAttempt,
  data: Prisma.FixAttemptUpdateManyMutationInput,
  condition: Prisma.FixAttemptWhereInput = {},
): Promise<void> {
  const changed = await tx.fixAttempt.updateMany({
    where: {
      projectId: caller.projectId,
      id: attempt.id,
      workItemId: attempt.workItemId,
      version: attempt.version,
      state: attempt.state,
      workerId: attempt.workerId,
      AND: [condition],
    },
    data: { ...data, version: { increment: 1 } },
  });
  if (changed.count !== 1) changedState();
}
