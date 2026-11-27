import { GENESIS_HASH, hashEntry, type AuditDraft } from '@graveshift/core';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../infra/prisma.service';
import { normalizeDraft } from '../audit.mapper';
import { AUDIT_SELECT } from '../audit.select';

export const DATABASE_NOW = Prisma.sql`statement_timestamp() AT TIME ZONE 'UTC'`;
export const UTC_DAY = Prisma.sql`date_trunc('day', ${DATABASE_NOW})`;

/** Inserts historical facts with the production normalization and hash encoding. */
export async function usageEntry(
  db: PrismaService,
  input: Pick<AuditDraft, 'type' | 'payload' | 'incidentId'> & {
    projectId?: string;
    at?: Prisma.Sql;
  },
): Promise<void> {
  const projectId = input.projectId ?? 'project-1';
  const time = await db.$queryRaw<{ at: Date }[]>(Prisma.sql`
    SELECT ${input.at ?? DATABASE_NOW} AS at
  `);
  if (!time[0]) throw new Error('The database did not return a fixture time.');
  const draft = normalizeDraft({
    key: crypto.randomUUID(),
    actor: 'fixture',
    type: input.type,
    payload: input.payload,
    ...(input.incidentId === undefined ? {} : { incidentId: input.incidentId }),
  });
  const head = await db.auditEntry.findFirst({
    where: { projectId },
    orderBy: { seq: 'desc' },
    select: AUDIT_SELECT,
  });
  const prevHash = head?.hash ?? GENESIS_HASH;
  const entry = {
    seq: (head?.seq ?? 0) + 1,
    at: time[0].at.toISOString(),
    actor: draft.actor,
    type: draft.type,
    payload: draft.payload,
    ...(draft.incidentId === undefined ? {} : { incidentId: draft.incidentId }),
  };
  await db.auditEntry.create({
    data: {
      ...entry,
      projectId,
      eventKey: draft.key,
      at: time[0].at,
      prevHash,
      hash: hashEntry(entry, prevHash),
    },
    select: AUDIT_SELECT,
  });
}
