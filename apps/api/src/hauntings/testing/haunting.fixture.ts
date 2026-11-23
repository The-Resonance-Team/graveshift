import { prepareRecordedHaunting } from '@graveshift/core/recorded';

export const HAUNTING_AT = '2026-11-21T00:00:00.000Z';
export const HAUNTING_SECRET = 'AKIAIOSFODNN7EXAMPLE';
export const HAUNTING_FIXTURE = prepareRecordedHaunting({
  incident: {
    id: 'haunting-1',
    service: 'api',
    state: 'diagnosed',
    signalIds: ['detection-1'],
    openedAt: HAUNTING_AT,
    updatedAt: HAUNTING_AT,
    lastActionAt: HAUNTING_AT,
    diagnosis: {
      id: 'diagnosis-1',
      incidentId: 'haunting-1',
      rootCause: `failure with ${HAUNTING_SECRET}`,
      confidence: 0.9,
      createdAt: HAUNTING_AT,
      evidence: [{ ref: 'detection-1', excerpt: `observed ${HAUNTING_SECRET}` }],
    },
  },
  severity: 'critical',
  category: 'code_bug',
  detections: [
    {
      id: 'detection-1',
      projectId: 'project-1',
      eventId: 'event-1',
      traceId: 'trace-1',
      rule: 'runtime.restart-loop',
      service: 'api',
      severity: 'critical',
      fingerprint: 'api:crash',
      message: HAUNTING_SECRET,
      observedAt: HAUNTING_AT,
    },
  ],
  pr: {
    repo: 'team/api',
    number: 3,
    url: 'https://github.com/team/api/pull/3',
    branch: 'fix/api',
    headSha: 'a'.repeat(40),
  },
  timeline: [{ at: HAUNTING_AT, type: 'diagnosed', detail: 'Recorded facts' }],
  deploymentId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  deploymentEnvironment: 'production',
});
