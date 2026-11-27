import { describe, expect, test } from 'bun:test';

import { SharedPolicyContextSchema } from './policy-context';
import { prepareRecordedHaunting, RecordedHauntingSchema } from './recorded';

const at = '2026-11-21T00:00:00.000Z';
const id = '9b67e2a4-8c15-4f09-a2d6-ab0912345678';
const view = {
  incident: {
    id,
    service: 'api',
    state: 'diagnosed',
    signalIds: ['detection-1'],
    openedAt: at,
    updatedAt: at,
    lastActionAt: at,
    diagnosis: {
      id: 'diagnosis-1',
      incidentId: id,
      rootCause: 'failure for ops@example.com',
      confidence: 0.9,
      createdAt: at,
      evidence: [{ ref: id, excerpt: 'Bearer abcdefgh1234' }],
    },
  },
  severity: 'critical',
  category: 'code_bug',
  detections: [
    {
      id: 'detection-1',
      eventId: id,
      projectId: 'project-1',
      traceId: id,
      rule: 'runtime.restart-loop',
      service: 'api',
      severity: 'critical',
      fingerprint: id,
      message: 'ops@example.com',
      observedAt: at,
    },
  ],
  pr: {
    repo: 'team/api',
    number: 1,
    url: 'https://github.com/team/api/pull/1',
    branch: 'fix/api',
    headSha: 'a'.repeat(40),
  },
  timeline: [{ at, type: 'diagnosed', detail: 'ops@example.com' }],
};

describe('recorded Haunting', () => {
  test('preserves complete Incident and Detection facts while processing evidence', () => {
    const prepared = prepareRecordedHaunting(view);
    expect(prepared.incident.id).toBe(id);
    expect(prepared.incident.lastActionAt).toBe(at);
    expect(prepared.incident.diagnosis?.evidence).toEqual([
      { ref: id, excerpt: 'Bearer [REDACTED:bearer]' },
    ]);
    expect(prepared.incident.diagnosis?.rootCause).toBe('failure for [REDACTED:email]');
    expect(prepared.detections[0]).toMatchObject({
      ...view.detections[0],
      message: '[REDACTED:email]',
    });
    expect(prepared.timeline).toEqual([{ at, type: 'diagnosed', detail: '[REDACTED:email]' }]);
    expect(prepared.pr).toEqual(view.pr);
    expect(prepareRecordedHaunting(prepared)).toEqual(prepared);
    expect(RecordedHauntingSchema.parse(JSON.parse(JSON.stringify(prepared)))).toEqual(prepared);
  });

  test('rejects unknown fields and broken Diagnosis or Grave binding', () => {
    for (const input of [
      { ...view, extra: true },
      { ...view, incident: { ...view.incident, extra: true } },
      {
        ...view,
        incident: { ...view.incident, diagnosis: { ...view.incident.diagnosis, extra: true } },
      },
      {
        ...view,
        incident: {
          ...view.incident,
          diagnosis: { ...view.incident.diagnosis, incidentId: 'foreign' },
        },
      },
      { ...view, detections: [{ ...view.detections[0], service: 'foreign' }] },
      { ...view, category: 'invented_category' },
      { ...view, detections: [{ rule: 'runtime.restart-loop' }] },
    ])
      expect(RecordedHauntingSchema.safeParse(input).success).toBe(false);
  });

  test('rejects sensitive identities instead of rewriting references', () => {
    expect(() =>
      prepareRecordedHaunting({
        ...view,
        incident: { ...view.incident, service: 'ops@example.com' },
      }),
    ).toThrow();
    expect(() =>
      prepareRecordedHaunting({
        ...view,
        detections: [{ ...view.detections[0], traceId: 'Bearer abcdefgh1234' }],
      }),
    ).toThrow();
  });
});

describe('SharedPolicyContextSchema', () => {
  const context = {
    service: 'api',
    category: 'code_bug',
    signals: ['runtime.restart-loop'],
    confidence: 0.9,
    counters: { openPrsLastHour: 1, actionsLast10Min: 2, diagnosisLoops: 1, llmSpentTodayUsd: 0.2 },
  };

  test('accepts complete known policy facts without filling missing counters', () => {
    expect(SharedPolicyContextSchema.parse(context)).toEqual(context);
    const { openPrsLastHour: _openPrsLastHour, ...missing } = context.counters;
    expect(SharedPolicyContextSchema.safeParse({ ...context, counters: missing }).success).toBe(
      false,
    );
    expect(SharedPolicyContextSchema.safeParse({ ...context, counters: {} }).success).toBe(false);
  });

  test('rejects negative, nonfinite and unknown counter facts', () => {
    for (const counters of [
      { ...context.counters, diagnosisLoops: -1 },
      { ...context.counters, openPrsLastHour: 1.5 },
      { ...context.counters, llmSpentTodayUsd: Infinity },
      { ...context.counters, extra: 0 },
    ])
      expect(SharedPolicyContextSchema.safeParse({ ...context, counters }).success).toBe(false);
  });
});
