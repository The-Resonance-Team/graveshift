import { RoutingProgressSchema } from '@graveshift/agents/routing';
import { DiagnosisSchema, PrRefSchema, WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

import { FixResultSchema, FixTriggerSchema } from './results';

export const FixAttemptStateSchema = z.enum([
  'claimed',
  'awaiting_answer',
  'running',
  'publishing',
  'completed',
  'failed',
  'needs_human',
  'uncertain',
]);
export type FixAttemptState = z.infer<typeof FixAttemptStateSchema>;

export const PublicationIntentSchema = z
  .object({
    repo: z.string().min(1),
    branch: z.string().min(1),
    baseSha: z.string().min(1),
  })
  .strict();
export type PublicationIntent = z.infer<typeof PublicationIntentSchema>;

export const PublicationSchema = z.union([PrRefSchema, PublicationIntentSchema]);

export const FixAttemptSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    workItemId: z.string().min(1),
    commandId: z.string().min(1),
    workerId: z.string().min(1).nullable(),
    leaseUntil: z.iso.datetime().nullable(),
    agent: z.string().min(1),
    trigger: FixTriggerSchema,
    state: FixAttemptStateSchema,
    routingProgress: RoutingProgressSchema.nullable(),
    params: z.record(z.string(), z.string()),
    questionId: z.string().min(1).nullable(),
    result: FixResultSchema.nullable(),
    publication: PublicationSchema.nullable(),
    baseSha: z.string().min(1).nullable(),
    version: z.number().int().min(0),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type FixAttempt = z.infer<typeof FixAttemptSchema>;

export const WorkSnapshotSchema = z
  .object({
    item: WorkItemSchema,
    version: z.number().int().min(0),
    activeAttempt: FixAttemptSchema.optional(),
    diagnosis: DiagnosisSchema.optional(),
  })
  .strict();
export type WorkSnapshot = z.infer<typeof WorkSnapshotSchema>;
