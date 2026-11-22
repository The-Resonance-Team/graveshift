import { AsyncLocalStorage } from 'node:async_hooks';

import { AuditDraftSchema, type AuditDraft } from '@graveshift/core';
import type { AuditSink } from '@graveshift/gateway';
import { z } from 'zod';

import type { PrivateApi } from './api-client';
import { modelContext } from './model-context';

/**
 * The scope an audit entry belongs to (ADR 0018). The chain is keyed by `projectId` and every
 * entry records `actor`. Both come from the caller the API authenticated, never from a
 * deployment-wide value: the daemon holds no project id of its own for audit writes.
 */
export interface AuditScope {
  readonly projectId: string;
  readonly actor: string;
}

/** Thrown when an audit write has no authenticated scope or the durable append failed. */
export class AuditUnavailable extends Error {
  constructor() {
    super('an audit entry needs the authenticated projectId and actor');
  }
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

const scopeStorage = new AsyncLocalStorage<AuditScope>();

/**
 * Run one unit of work with an audit scope bound. Anything it awaits, including the shared
 * gateway and its audit sink, reads the same scope and no other.
 */
export function withAuditScope<T>(scope: AuditScope, work: () => Promise<T>): Promise<T> {
  return scopeStorage.run(Object.freeze({ ...scope }), work);
}

/** The bound audit scope, or undefined outside an authenticated unit of work. */
export function currentAuditScope(): AuditScope | undefined {
  const scope = scopeStorage.getStore();
  if (scope === undefined || blank(scope.projectId) || blank(scope.actor)) return undefined;
  return scope;
}

function requireAuditScope(explicit?: AuditScope): AuditScope {
  const scope = explicit ?? currentAuditScope();
  if (scope === undefined || blank(scope.projectId) || blank(scope.actor)) {
    throw new AuditUnavailable();
  }
  return scope;
}

export type WriteAudit = (draft: AuditDraft, scope?: AuditScope) => Promise<void>;

/**
 * The only durable audit writer. Every entry is appended to the chain of the bound
 * authenticated scope through the API's internal endpoint, which checks the caller's grant. A
 * write with no scope is refused, so no entry can be made against a Project nobody asked for.
 */
export function createAudit(api: PrivateApi): WriteAudit {
  return async (input, explicit) => {
    const draft = AuditDraftSchema.parse(input);
    const scope = requireAuditScope(explicit);
    const ack = await api.post(
      '/internal/audit',
      { projectId: scope.projectId, draft },
      z.object({ key: z.string().min(1) }).strict(),
    );
    if (ack.key !== draft.key) throw new Error('Audit acknowledgement does not match');
  };
}

/** The gateway model-call audit type. Its payload feeds the model usage query. */
export const MODEL_CALL_AUDIT_TYPE = 'model.call';

/**
 * The gateway's audit sink. It attributes one model call to the authenticated scope bound for
 * the attempt that made the call (ADR 0018), never to a deployment-wide project. A call made
 * outside an authenticated scope has no chain, so the sink refuses it and the gateway withholds
 * the result instead of spending budget on an unauditable call.
 */
export function gatewayAudit(write: WriteAudit): AuditSink {
  return async (event) => {
    const scope = requireAuditScope();
    const context = modelContext();
    await write(
      {
        key: `gateway:${event.callId}`,
        actor: event.agent,
        type: MODEL_CALL_AUDIT_TYPE,
        ...(context === undefined ? {} : { incidentId: context.incidentId }),
        payload: { ...event, ...(context === undefined ? {} : { service: context.service }) },
      },
      scope,
    );
    return { callId: event.callId };
  };
}
