import type { ActionProposal, Approval, Diagnosis, Incident, IncidentState } from './schemas';
import { err, ok, type Result, TransitionError } from './errors';

export const TRANSITIONS: Readonly<Record<IncidentState, readonly IncidentState[]>> = {
  open: ['diagnosing', 'resolved', 'dismissed'],
  diagnosing: ['diagnosed', 'open', 'dismissed'],
  diagnosed: ['awaiting_approval', 'resolved', 'dismissed'],
  awaiting_approval: ['acting', 'diagnosed', 'dismissed'],
  acting: ['resolved', 'diagnosed'],
  resolved: ['open'],
  dismissed: [],
};

export const BREAKER_WINDOW_MS = 10 * 60 * 1000;

export interface TransitionContext {
  now: Date;
  diagnosis?: Diagnosis;
  action?: ActionProposal;
  approval?: Approval;
}

const guardFailed = (message: string) => err(new TransitionError('GUARD_FAILED', message));

function guard(incident: Incident, to: IncidentState, ctx: TransitionContext): string | undefined {
  const { diagnosis, action, approval, now } = ctx;
  if (to === 'diagnosed' && incident.state === 'diagnosing') {
    if (diagnosis?.incidentId !== incident.id) return 'diagnosis for this incident required';
  }
  if (to === 'awaiting_approval') {
    if (!incident.diagnosis) return 'diagnosis required before approval';
    if (action?.incidentId !== incident.id) return 'action proposal for this incident required';
    if (Date.parse(action.expiresAt) <= now.getTime()) return 'action proposal expired';
  }
  if (to === 'acting') {
    if (action?.incidentId !== incident.id) return 'action proposal for this incident required';
    if (approval?.decision !== 'approved') return 'approved approval required';
    if (approval.actionId !== action.id || approval.incidentId !== incident.id) {
      return 'approval does not match action';
    }
    if (Date.parse(approval.expiresAt) <= now.getTime()) return 'approval expired';
  }
  return undefined;
}

export function transition(
  incident: Incident,
  to: IncidentState,
  ctx: TransitionContext,
): Result<Incident, TransitionError> {
  if (!TRANSITIONS[incident.state].includes(to)) {
    return err(new TransitionError('ILLEGAL_TRANSITION', `${incident.state} -> ${to}`));
  }
  const failure = guard(incident, to, ctx);
  if (failure) return guardFailed(failure);

  const at = ctx.now.toISOString();
  const { resolvedAt: _resolvedAt, ...rest } = incident;
  const next: Incident = { ...rest, state: to, updatedAt: at };
  if (to === 'diagnosed' && ctx.diagnosis && incident.state === 'diagnosing') {
    next.diagnosis = ctx.diagnosis;
  }
  if (to === 'acting') next.lastActionAt = at;
  if (to === 'resolved') next.resolvedAt = at;
  return ok(next);
}

export function shouldTripBreaker(incident: Incident, reopenedAt: Date): boolean {
  if (!incident.lastActionAt) return false;
  return reopenedAt.getTime() - Date.parse(incident.lastActionAt) < BREAKER_WINDOW_MS;
}
