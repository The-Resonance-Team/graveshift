import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { action, approval, diagnosis, incidentAt, NOW } from './fixtures';
import { type Incident, INCIDENT_STATES, IncidentSchema } from './schemas';
import { BREAKER_WINDOW_MS, shouldTripBreaker, TRANSITIONS, transition } from './state';

const state = fc.constantFrom(...INCIDENT_STATES);
const fullCtx = { now: NOW, diagnosis, action, approval };

describe('incident state machine', () => {
  test('property: transition succeeds only along edges of TRANSITIONS', () => {
    fc.assert(
      fc.property(state, state, (from, to) => {
        const result = transition(incidentAt(from, diagnosis), to, fullCtx);
        if (TRANSITIONS[from].includes(to)) {
          expect(result.ok).toBe(true);
        } else {
          expect(!result.ok && result.error.code).toBe('ILLEGAL_TRANSITION');
        }
      }),
    );
  });

  test('property: dismissed is terminal', () => {
    fc.assert(
      fc.property(state, (to) => {
        expect(transition(incidentAt('dismissed'), to, fullCtx).ok).toBe(false);
      }),
    );
  });

  test('property: acting requires a matching, approved, unexpired approval', () => {
    const offset = fc.integer({ min: -1_000_000, max: 1_000_000 });
    fc.assert(
      fc.property(
        fc.constantFrom('approved', 'rejected' as const),
        fc.boolean(),
        fc.boolean(),
        offset,
        (decision, actionMatches, incidentMatches, expiresOffset) => {
          const candidate = {
            ...approval,
            decision,
            actionId: actionMatches ? action.id : 'other-action',
            incidentId: incidentMatches ? 'inc-1' : 'other-incident',
            expiresAt: new Date(NOW.getTime() + expiresOffset).toISOString(),
          };
          const result = transition(incidentAt('awaiting_approval', diagnosis), 'acting', {
            now: NOW,
            action,
            approval: candidate,
          });
          const allowed =
            decision === 'approved' && actionMatches && incidentMatches && expiresOffset > 0;
          expect(result.ok).toBe(allowed);
        },
      ),
    );
  });

  test('acting is rejected without approval or action', () => {
    const incident = incidentAt('awaiting_approval', diagnosis);
    expect(transition(incident, 'acting', { now: NOW, action }).ok).toBe(false);
    expect(transition(incident, 'acting', { now: NOW, approval }).ok).toBe(false);
  });

  test('awaiting_approval requires diagnosis and a live action', () => {
    expect(transition(incidentAt('diagnosed'), 'awaiting_approval', { now: NOW, action }).ok).toBe(
      false,
    );
    const expired = { ...action, expiresAt: NOW.toISOString() };
    const stale = transition(incidentAt('diagnosed', diagnosis), 'awaiting_approval', {
      now: NOW,
      action: expired,
    });
    expect(stale.ok).toBe(false);
  });

  test('diagnosed requires a diagnosis of the same incident', () => {
    const wrong = { ...diagnosis, incidentId: 'other' };
    expect(transition(incidentAt('diagnosing'), 'diagnosed', { now: NOW }).ok).toBe(false);
    expect(
      transition(incidentAt('diagnosing'), 'diagnosed', { now: NOW, diagnosis: wrong }).ok,
    ).toBe(false);
  });

  test('property: random walks keep the incident valid and timestamps consistent', () => {
    fc.assert(
      fc.property(fc.array(state, { maxLength: 30 }), (targets) => {
        let incident: Incident = incidentAt('open');
        for (const to of targets) {
          const result = transition(incident, to, fullCtx);
          if (!result.ok) continue;
          incident = result.value;
          expect(IncidentSchema.safeParse(incident).success).toBe(true);
          expect(incident.state).toBe(to);
          expect(incident.updatedAt).toBe(NOW.toISOString());
          expect(incident.resolvedAt !== undefined).toBe(to === 'resolved');
          if (to === 'acting') expect(incident.lastActionAt).toBe(NOW.toISOString());
        }
        expect(incident.id).toBe('inc-1');
        expect(incident.openedAt).toBe(incidentAt('open').openedAt);
      }),
    );
  });

  test('property: transition never mutates its input', () => {
    fc.assert(
      fc.property(state, state, (from, to) => {
        const incident = incidentAt(from, diagnosis);
        const before = structuredClone(incident);
        transition(incident, to, fullCtx);
        expect(incident).toEqual(before);
      }),
    );
  });

  test('property: breaker trips iff reopened inside the window after an action', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 * BREAKER_WINDOW_MS }), (gap) => {
        const incident = {
          ...incidentAt('resolved'),
          lastActionAt: NOW.toISOString(),
        };
        expect(shouldTripBreaker(incident, new Date(NOW.getTime() + gap))).toBe(
          gap < BREAKER_WINDOW_MS,
        );
      }),
    );
    expect(shouldTripBreaker(incidentAt('resolved'), NOW)).toBe(false);
  });
});
