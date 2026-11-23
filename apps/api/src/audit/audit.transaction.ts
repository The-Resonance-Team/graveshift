import { Prisma } from '@prisma/client';

import type { PrismaService } from '../infra/prisma.service';
import { AuditBusy } from './audit.errors';

/** Repository-only composition: retry the complete database unit, with no external effects. */
export async function inAuditTransaction<Result>(
  prisma: PrismaService,
  task: (tx: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
  async function run(attempt: number): Promise<Result> {
    try {
      return await prisma.$transaction(task, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !(
          error.code === 'P2034' ||
          (error.code === 'P2002' && error.meta?.modelName === 'AuditEntry')
        )
      ) {
        throw error;
      }
      if (attempt >= 19) throw new AuditBusy(error);
      await Bun.sleep(Math.min(5 * 2 ** attempt, 100) + Math.random() * 10);
      return run(attempt + 1);
    }
  }
  return run(0);
}
