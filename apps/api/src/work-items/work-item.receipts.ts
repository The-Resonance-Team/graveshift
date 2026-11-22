import {
  WorkError,
  triageResult,
  type FixAttempt,
  type FixResult,
  type WorkCaller,
} from '@graveshift/work';
import type { Prisma } from '@prisma/client';

import { commandReceipt } from './work-item.state';
import { WORK_COMMAND_SELECT } from './work-item.select';

export async function requireCommand(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  attempt: FixAttempt,
): Promise<void> {
  const receipt = await commandReceipt(tx, caller, id);
  if (!receipt || receipt.attemptId !== attempt.id) {
    throw new WorkError('COMMAND_CONFLICT', 'This command does not own the Fix attempt');
  }
}

export async function recordResult(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  result: FixResult,
): Promise<void> {
  const commands = await tx.workCommand.findMany({
    where: { projectId: caller.projectId, workItemId: id, attemptId: result.attemptId },
    select: WORK_COMMAND_SELECT,
  });
  await Promise.all(
    commands.map(async (command) => {
      const outcome =
        command.kind === 'triage'
          ? { kind: 'triage' as const, result: triageResult(result) }
          : { kind: 'fix' as const, result };
      await tx.workCommand.update({
        where: {
          projectId_commandId: { projectId: caller.projectId, commandId: command.commandId },
        },
        data: { result: outcome },
        select: { commandId: true },
      });
    }),
  );
}
