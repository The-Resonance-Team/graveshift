import { redact } from '@graveshift/redactor';
import { z } from 'zod';

import { assertSafeMetadata } from './privacy';
import { DiagnosisSchema, EventEnvelopeSchema, IncidentSchema } from './schemas';
import { PrRefSchema } from './work-item';

export const HAUNTING_CATEGORIES = [
  'code_bug',
  'config_error',
  'deploy_regression',
  'resource_exhaustion',
  'unknown',
] as const;
export const HauntingCategorySchema = z.enum(HAUNTING_CATEGORIES);
export type HauntingCategory = z.infer<typeof HauntingCategorySchema>;

const field = EventEnvelopeSchema.shape;
export const RecordedDetectionSchema = z.strictObject({
  id: field.id,
  projectId: field.projectId,
  eventId: field.id,
  traceId: field.traceId,
  rule: field.id,
  service: field.service,
  severity: field.severity,
  fingerprint: field.fingerprint,
  message: z.string(),
  observedAt: field.observedAt,
});
export type RecordedDetection = z.infer<typeof RecordedDetectionSchema>;

export const HauntingTimelineSchema = z.strictObject({
  at: field.observedAt,
  type: field.id,
  detail: z.string(),
});

const diagnosisSchema = DiagnosisSchema.extend({
  evidence: z.array(DiagnosisSchema.shape.evidence.element.strict()).min(1),
}).strict();

export const RecordedHauntingSchema = z
  .strictObject({
    incident: IncidentSchema.extend({ diagnosis: diagnosisSchema.optional() }).strict(),
    severity: field.severity.optional(),
    category: HauntingCategorySchema.optional(),
    detections: z.array(RecordedDetectionSchema),
    pr: PrRefSchema.optional(),
    timeline: z.array(HauntingTimelineSchema).optional(),
    // Inherited from the Event that opened this Haunting. Null when unassigned.
    deploymentId: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullish(),
    // The Environment of that same opening Event. Paired with deploymentId for closure.
    deploymentEnvironment: field.environment,
  })
  .superRefine((view, context) => {
    if (view.incident.diagnosis && view.incident.diagnosis.incidentId !== view.incident.id) {
      context.addIssue({ code: 'custom', message: 'Diagnosis must refer to this Haunting' });
    }
    if (view.detections.some((detection) => detection.service !== view.incident.service)) {
      context.addIssue({ code: 'custom', message: 'Detections must refer to this Grave' });
    }
    if (Date.parse(view.incident.updatedAt) < Date.parse(view.incident.openedAt)) {
      context.addIssue({ code: 'custom', message: 'Haunting update precedes its opening' });
    }
  });
export type RecordedHaunting = z.infer<typeof RecordedHauntingSchema>;

/** Preserve references and recorded times while processing untrusted evidence and detail. */
export function prepareRecordedHaunting(input: unknown): RecordedHaunting {
  const view = RecordedHauntingSchema.parse(input);
  const { incident } = view;
  const diagnosis = incident.diagnosis;
  assertSafeMetadata([
    incident.id,
    incident.service,
    ...(view.deploymentId === null || view.deploymentId === undefined ? [] : [view.deploymentId]),
    ...incident.signalIds,
    ...(diagnosis
      ? [diagnosis.id, diagnosis.incidentId, ...diagnosis.evidence.map((e) => e.ref)]
      : []),
    ...(view.pr ? Object.values(view.pr).filter((value) => typeof value === 'string') : []),
    ...(view.timeline ?? []).map((entry) => entry.type),
  ]);
  const detections = view.detections.map((detection) => {
    assertSafeMetadata([
      detection.id,
      detection.projectId,
      detection.eventId,
      detection.traceId,
      detection.rule,
      detection.service,
      detection.fingerprint,
    ]);
    return { ...detection, message: redact(detection.message) };
  });
  return RecordedHauntingSchema.parse({
    ...view,
    incident: {
      ...incident,
      ...(diagnosis
        ? {
            diagnosis: {
              ...diagnosis,
              rootCause: redact(diagnosis.rootCause),
              evidence: diagnosis.evidence.map((entry) => ({
                ...entry,
                excerpt: redact(entry.excerpt),
              })),
            },
          }
        : {}),
    },
    detections,
    ...(view.timeline
      ? {
          timeline: view.timeline.map((entry) => ({
            ...entry,
            detail: redact(entry.detail),
          })),
        }
      : {}),
  });
}
