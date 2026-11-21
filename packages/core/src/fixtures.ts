import type { ActionProposal, Approval, Diagnosis, Incident } from './schemas';

export const NOW = new Date('2026-11-20T10:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

export const incidentAt = (state: Incident['state'], diagnosis?: Diagnosis): Incident => ({
  id: 'inc-1',
  service: 'api',
  state,
  signalIds: ['sig-1'],
  openedAt: iso(-3_600_000),
  updatedAt: iso(-60_000),
  ...(diagnosis ? { diagnosis } : {}),
});

export const diagnosis: Diagnosis = {
  id: 'dia-1',
  incidentId: 'inc-1',
  rootCause: 'memory leak',
  evidence: [{ ref: 'log:1', excerpt: 'OOMKilled' }],
  confidence: 0.8,
  createdAt: iso(-120_000),
};

export const action: ActionProposal = {
  id: 'act-1',
  incidentId: 'inc-1',
  service: 'api',
  kind: 'restart',
  proposedAt: iso(-90_000),
  expiresAt: iso(600_000),
};

export const approval: Approval = {
  id: 'apr-1',
  actionId: 'act-1',
  incidentId: 'inc-1',
  decision: 'approved',
  decidedBy: 'alice',
  decidedAt: iso(-30_000),
  expiresAt: iso(300_000),
};
