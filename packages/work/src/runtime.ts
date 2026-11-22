import { RoutingProgressSchema } from '@graveshift/agents/routing';
import { PrRefSchema } from '@graveshift/core';
import { z } from 'zod';

import {
  AnswerBodySchema,
  StartCommandSchema,
  TriageBodySchema,
  WorkCallerSchema,
  WorkRequestSchema,
  type CanonicalWorkRef,
  type WorkCaller,
  type WorkRequest,
} from './commands';
import {
  FixCompletionSchema,
  FixResultSchema,
  WorkOutcomeSchema,
  type FixResult,
  type WorkOutcome,
} from './results';
import {
  AbandonSchema,
  AbortPublicationSchema,
  HeartbeatSchema,
  HeartbeatResultSchema,
  type Abandon,
  type AbortPublication,
  type Heartbeat,
  type HeartbeatResult,
} from './execution';
import {
  FixAttemptSchema,
  PublicationIntentSchema,
  WorkSnapshotSchema,
  type WorkSnapshot,
} from './state';

const version = z.number().int().min(0);
const fence = { expectedVersion: version, attemptId: z.string().min(1), attemptVersion: version };

export const SaveTriageSchema = z
  .object({ expectedVersion: version, body: TriageBodySchema })
  .strict();
export type SaveTriage = z.infer<typeof SaveTriageSchema>;

export const ClaimFixSchema = z
  .object({ expectedVersion: version, command: StartCommandSchema })
  .strict();
export type ClaimFix = z.infer<typeof ClaimFixSchema>;

export const SaveQuestionSchema = z.object({ ...fence, progress: RoutingProgressSchema }).strict();
export type SaveQuestion = z.infer<typeof SaveQuestionSchema>;

export const ApplyAnswerSchema = z
  .object({ expectedVersion: version, attemptVersion: version, body: AnswerBodySchema })
  .strict();
export type ApplyAnswer = z.infer<typeof ApplyAnswerSchema>;

export const BeginPublicationSchema = z
  .object({ ...fence, intent: PublicationIntentSchema })
  .strict();
export type BeginPublication = z.infer<typeof BeginPublicationSchema>;

export const RecordPublicationSchema = z
  .object({ ...fence, pr: PrRefSchema, baseSha: z.string().min(1) })
  .strict();
export type RecordPublication = z.infer<typeof RecordPublicationSchema>;

export const FinishAttemptSchema = z
  .object({
    ...fence,
    state: z.enum(['completed', 'failed', 'needs_human', 'uncertain']),
    outcome: FixCompletionSchema,
  })
  .strict();
export type FinishAttempt = z.infer<typeof FinishAttemptSchema>;

export const TriageSaveResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), snapshot: WorkSnapshotSchema }).strict(),
  z.object({ kind: z.literal('replay'), outcome: WorkOutcomeSchema }).strict(),
]);
export type TriageSaveResult = z.infer<typeof TriageSaveResultSchema>;

export const ClaimResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('claimed'),
      snapshot: WorkSnapshotSchema,
      attempt: FixAttemptSchema,
    })
    .strict(),
  z.object({ kind: z.literal('replay'), outcome: WorkOutcomeSchema }).strict(),
]);
export type ClaimResult = z.infer<typeof ClaimResultSchema>;

export const ReplayResultSchema = WorkOutcomeSchema.nullable();

/** API-owned state operations. A returned write is committed before the next remote effect. */
export interface WorkRuntime {
  read(ref: CanonicalWorkRef): Promise<WorkSnapshot>;
  replay(caller: WorkCaller, id: string, request: WorkRequest): Promise<WorkOutcome | null>;
  saveTriage(caller: WorkCaller, id: string, input: SaveTriage): Promise<TriageSaveResult>;
  claim(caller: WorkCaller, id: string, input: ClaimFix): Promise<ClaimResult>;
  saveQuestion(caller: WorkCaller, id: string, input: SaveQuestion): Promise<FixResult>;
  applyAnswer(caller: WorkCaller, id: string, input: ApplyAnswer): Promise<ClaimResult>;
  beginPublication(caller: WorkCaller, id: string, input: BeginPublication): Promise<WorkSnapshot>;
  recordPublication(
    caller: WorkCaller,
    id: string,
    input: RecordPublication,
  ): Promise<WorkSnapshot>;
  finish(caller: WorkCaller, id: string, input: FinishAttempt): Promise<FixResult>;
  heartbeat(caller: WorkCaller, id: string, input: Heartbeat): Promise<HeartbeatResult>;
  abandon(caller: WorkCaller, id: string, input: Abandon): Promise<FixResult>;
  abortPublication(caller: WorkCaller, id: string, input: AbortPublication): Promise<FixResult>;
}

export const ReadWorkSchema = z.object({ projectId: z.string().min(1) }).strict();
export const ReplayWorkSchema = z
  .object({ caller: WorkCallerSchema, request: WorkRequestSchema })
  .strict();

export const SaveTriageRequestSchema = z
  .object({ caller: WorkCallerSchema, input: SaveTriageSchema })
  .strict();
export const ClaimFixRequestSchema = z
  .object({ caller: WorkCallerSchema, input: ClaimFixSchema })
  .strict();
export const SaveQuestionRequestSchema = z
  .object({ caller: WorkCallerSchema, input: SaveQuestionSchema })
  .strict();
export const ApplyAnswerRequestSchema = z
  .object({ caller: WorkCallerSchema, input: ApplyAnswerSchema })
  .strict();
export const PublicationRequestSchema = z
  .object({ caller: WorkCallerSchema, input: RecordPublicationSchema })
  .strict();
export const BeginPublicationRequestSchema = z
  .object({ caller: WorkCallerSchema, input: BeginPublicationSchema })
  .strict();
export const FinishAttemptRequestSchema = z
  .object({ caller: WorkCallerSchema, input: FinishAttemptSchema })
  .strict();
export const HeartbeatRequestSchema = z
  .object({ caller: WorkCallerSchema, input: HeartbeatSchema })
  .strict();
export const AbandonRequestSchema = z
  .object({ caller: WorkCallerSchema, input: AbandonSchema })
  .strict();
export const AbortPublicationRequestSchema = z
  .object({ caller: WorkCallerSchema, input: AbortPublicationSchema })
  .strict();

export const WORK_STATE_RESPONSES = {
  read: WorkSnapshotSchema,
  replay: ReplayResultSchema,
  'save-triage': TriageSaveResultSchema,
  claim: ClaimResultSchema,
  'save-question': FixResultSchema,
  'apply-answer': ClaimResultSchema,
  'begin-publication': WorkSnapshotSchema,
  'record-publication': WorkSnapshotSchema,
  finish: FixResultSchema,
  heartbeat: HeartbeatResultSchema,
  abandon: FixResultSchema,
  'abort-publication': FixResultSchema,
} as const;

export type WorkStateAction = keyof typeof WORK_STATE_RESPONSES;

export function workPath(id: string, action: WorkStateAction): string {
  return `/internal/work-items/${encodeURIComponent(id)}/${action}`;
}
