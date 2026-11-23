import { describe, expect, test } from 'bun:test';

import { appliedSeq, hauntingData, mergeRecorded, toRecordedHaunting } from './haunting.mapper';
import { HAUNTING_AT, HAUNTING_FIXTURE, HAUNTING_SECRET } from './testing/haunting.fixture';

describe('recorded Haunting projection', () => {
  test('round-trips complete canonical facts after a new repository reads the stored row', () => {
    const stored = hauntingData(HAUNTING_FIXTURE, 7);
    const row = {
      ...stored,
      projectId: 'project-1',
      diagnosis: HAUNTING_FIXTURE.incident.diagnosis ?? null,
      pr: HAUNTING_FIXTURE.pr ?? null,
    };
    const restored = toRecordedHaunting(row);
    expect(restored).toEqual(HAUNTING_FIXTURE);
    expect(appliedSeq(row)).toBe(7);
    expect(JSON.stringify(restored)).not.toContain('auditSeq');
    expect(JSON.stringify(stored)).not.toContain(HAUNTING_SECRET);
  });

  test('keeps recorded diagnosis and PR facts when a Watcher observation omits them', () => {
    const {
      diagnosis: _diagnosis,
      lastActionAt: _lastActionAt,
      ...incident
    } = HAUNTING_FIXTURE.incident;
    const updatedAt = '2026-11-21T00:01:00.000Z';
    const next = { incident: { ...incident, updatedAt }, detections: HAUNTING_FIXTURE.detections };
    const merged = mergeRecorded(HAUNTING_FIXTURE, next);
    expect(merged.incident.diagnosis).toEqual(HAUNTING_FIXTURE.incident.diagnosis);
    expect(merged.incident.lastActionAt).toBe(HAUNTING_AT);
    expect(merged.pr).toEqual(HAUNTING_FIXTURE.pr);
    expect(merged.category).toBe('code_bug');
    expect(merged.timeline).toEqual([
      { at: HAUNTING_AT, type: 'diagnosed', detail: 'Recorded facts' },
      { at: updatedAt, type: 'diagnosed', detail: 'Haunting diagnosed' },
    ]);
    expect(mergeRecorded(HAUNTING_FIXTURE, next)).toEqual(merged);
  });

  test('keeps the opening Deployment pair when a later observation changes both fields', () => {
    const prior = {
      ...HAUNTING_FIXTURE,
      deploymentId: 'a'.repeat(40),
      deploymentEnvironment: 'production',
    };
    const next = {
      ...HAUNTING_FIXTURE,
      deploymentId: 'b'.repeat(40),
      deploymentEnvironment: 'staging',
      incident: { ...HAUNTING_FIXTURE.incident, updatedAt: '2026-11-21T00:02:00.000Z' },
    };
    const merged = mergeRecorded(prior, next);
    expect(merged.deploymentId).toBe('a'.repeat(40));
    expect(merged.deploymentEnvironment).toBe('production');
  });
});
