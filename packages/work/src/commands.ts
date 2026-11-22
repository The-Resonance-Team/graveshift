import { z } from 'zod';

import type { FixResult, TriageResult } from './results';

export const WORK_COMMANDS = Symbol('WORK_COMMANDS');

export const WorkRefSchema = z
  .object({ projectId: z.string().min(1), id: z.string().min(1) })
  .strict();
export type CanonicalWorkRef = z.infer<typeof WorkRefSchema>;

export const WorkCallerSchema = z
  .object({
    projectId: z.string().min(1),
    actor: z.string().min(1).max(200),
    commandId: z.string().min(1).max(100),
    expectedVersion: z.number().int().min(0).optional(),
    workerId: z.string().min(1).max(100).optional(),
  })
  .strict();
export type WorkCaller = z.infer<typeof WorkCallerSchema>;

export const TriageBodySchema = z.object({ assignee: z.string().min(1) }).strict();
export type TriageBody = z.infer<typeof TriageBodySchema>;

export const FixNowBodySchema = z.object({ note: z.string().min(1).max(500).optional() }).strict();
export type FixNowBody = z.infer<typeof FixNowBodySchema>;

export const AnswerBodySchema = z
  .object({
    attemptId: z.string().min(1),
    questionId: z.string().min(1),
    params: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(10_000)),
  })
  .strict();
export type AnswerBody = z.infer<typeof AnswerBodySchema>;

export const StartCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('triage'), body: TriageBodySchema }).strict(),
  z.object({ kind: z.literal('fix_now'), body: FixNowBodySchema }).strict(),
]);
export type StartCommand = z.infer<typeof StartCommandSchema>;

export const WorkRequestSchema = z.discriminatedUnion('kind', [
  ...StartCommandSchema.options,
  z.object({ kind: z.literal('answer'), body: AnswerBodySchema }).strict(),
]);
export type WorkRequest = z.infer<typeof WorkRequestSchema>;

export interface WorkCommands {
  triage(caller: WorkCaller, id: string, body: TriageBody): Promise<TriageResult>;
  fixNow(caller: WorkCaller, id: string, body: FixNowBody): Promise<FixResult>;
  answer(caller: WorkCaller, id: string, body: AnswerBody): Promise<FixResult>;
}

export const TriageCommandSchema = z
  .object({ caller: WorkCallerSchema, id: z.string().min(1), input: TriageBodySchema })
  .strict();
export const FixNowCommandSchema = z
  .object({ caller: WorkCallerSchema, id: z.string().min(1), input: FixNowBodySchema })
  .strict();
export const AnswerCommandSchema = z
  .object({ caller: WorkCallerSchema, id: z.string().min(1), input: AnswerBodySchema })
  .strict();

export const WORK_COMMAND_PATHS = {
  triage: '/internal/work/triage',
  'fix-now': '/internal/work/fix-now',
  answer: '/internal/work/answer',
} as const;
export type WorkCommandAction = keyof typeof WORK_COMMAND_PATHS;
