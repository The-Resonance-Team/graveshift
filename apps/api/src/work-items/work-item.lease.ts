import { WORK_LEASE_MS, WorkError, type FixAttempt, type WorkCaller } from '@graveshift/work';
import type { Prisma } from '@prisma/client';
import { addMilliseconds } from 'date-fns';

export async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [clock] = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
  if (clock === undefined) throw new Error('The database clock is unavailable');
  return clock.at;
}

export async function newLease(tx: Prisma.TransactionClient, caller: WorkCaller) {
  return {
    workerId: caller.workerId ?? null,
    leaseUntil: addMilliseconds(await databaseNow(tx), WORK_LEASE_MS),
  };
}

export function assertWorker(attempt: FixAttempt, caller: WorkCaller): void {
  if (attempt.workerId !== null && attempt.workerId !== caller.workerId) {
    throw new WorkError('WORKER_CHANGED', 'Another worker owns this Fix attempt');
  }
}

export async function requireLiveLease(
  tx: Prisma.TransactionClient,
  attempt: FixAttempt,
  caller: WorkCaller,
): Promise<Date> {
  assertWorker(attempt, caller);
  const now = await databaseNow(tx);
  if (attempt.leaseUntil === null || new Date(attempt.leaseUntil) <= now) {
    throw new WorkError('LEASE_EXPIRED', 'The Fix attempt execution lease expired');
  }
  return now;
}

/** Recording a confirmed remote effect can transfer an expired publication to its recovery worker. */
export async function publicationOwner(
  tx: Prisma.TransactionClient,
  attempt: FixAttempt,
  caller: WorkCaller,
) {
  if (attempt.workerId === null || attempt.workerId === caller.workerId) return {};
  const now = await databaseNow(tx);
  if (
    caller.workerId === undefined ||
    (attempt.leaseUntil !== null && new Date(attempt.leaseUntil) > now)
  ) {
    throw new WorkError('WORKER_CHANGED', 'Another worker owns this Fix attempt');
  }
  return newLease(tx, caller);
}
