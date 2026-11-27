import type { AuditEntry } from '@graveshift/core';

export type AuditPage = { afterSeq?: number; limit?: number };

export type PolicyUsage = {
  actionsLast10Min: number;
  diagnosisLoops: number;
  llmSpentTodayUsd: number;
};

export type UsageRow = {
  actionsLast10Min: bigint;
  diagnosisLoops: bigint;
  modelCalls: bigint;
  unknownCosts: bigint;
  spentUsd: string | null;
};

export type ChainDraft = Pick<AuditEntry, 'seq' | 'at' | 'actor' | 'type' | 'payload'> &
  Pick<Partial<AuditEntry>, 'incidentId'>;

export type VerifyResult =
  | { ok: true; length: number }
  | { ok: false; brokenAtSeq: number; reason: string };
