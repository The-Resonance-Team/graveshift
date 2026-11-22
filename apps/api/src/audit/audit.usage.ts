import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { AuditCountersUnavailable } from './audit.errors';
import type { PolicyUsage } from './audit.types';

const safeCount = z.bigint().min(0n).max(BigInt(Number.MAX_SAFE_INTEGER)).transform(Number);
const usageRow = z.strictObject({
  actionsLast10Min: safeCount,
  diagnosisLoops: safeCount,
  modelCalls: safeCount,
  unknownCosts: z.literal(0n),
  spentUsd: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .nullable(),
});
const spend = z.number().nonnegative().finite();

export function usageQuery(projectId: string, service: string, incidentId: string): Prisma.Sql {
  return Prisma.sql`
    WITH clock AS (
      SELECT statement_timestamp() AT TIME ZONE 'UTC' AS now
    ), bounds AS (
      SELECT now, date_trunc('day', now) AS day_start FROM clock
    ), costs AS (
      SELECT CASE WHEN jsonb_typeof(payload -> 'costUsd') = 'number'
        THEN (payload ->> 'costUsd')::numeric END AS cost
      FROM audit_entries, bounds
      WHERE project_id = ${projectId} AND type = 'model.call'
        AND at >= day_start AND at < day_start + INTERVAL '1 day'
    )
    SELECT (
      SELECT count(*) FROM audit_entries, bounds
      WHERE project_id = ${projectId} AND type = 'actuator.admitted'
        AND payload ->> 'service' = ${service}
        AND at >= now - INTERVAL '10 minutes' AND at <= now
    ) AS "actionsLast10Min", (
      SELECT count(*) FROM audit_entries
      WHERE project_id = ${projectId} AND type = 'model.call'
        AND incident_id = ${incidentId} AND payload ->> 'task' = 'diagnose'
    ) AS "diagnosisLoops",
      count(*) AS "modelCalls",
      count(*) FILTER (WHERE cost IS NULL OR cost < 0) AS "unknownCosts",
      sum(cost)::text AS "spentUsd"
    FROM costs
  `;
}

export function parsePolicyUsage(input: unknown): PolicyUsage {
  const parsed = z.tuple([usageRow]).safeParse(input);
  if (!parsed.success) throw new AuditCountersUnavailable();
  const [row] = parsed.data;
  const empty = row.modelCalls === 0;
  if ((row.spentUsd === null) !== empty) throw new AuditCountersUnavailable();
  const cost = spend.safeParse(empty ? 0 : Number(row.spentUsd));
  if (!cost.success) throw new AuditCountersUnavailable();
  return {
    actionsLast10Min: row.actionsLast10Min,
    diagnosisLoops: row.diagnosisLoops,
    llmSpentTodayUsd: cost.data,
  };
}
