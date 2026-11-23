import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuditDraft } from '@graveshift/core';

/**
 * One audit write request. `projectId` is the scope from ADR 0018: every audit entry
 * carries it, and the hash chain is keyed by it.
 */
export interface AuditRecord extends AuditDraft {
  readonly projectId: string;
}

/**
 * The only seam for an audit write from a use case. The real sink writes through
 * `AuditRepo.append`, which owns the PostgreSQL append-only chain. It adds no store of its
 * own. Tests inject `InMemoryAuditSink` from `./testing/in-memory-audit.sink`.
 */
export interface AuditSink {
  append(record: AuditRecord): Promise<void>;
}

export const AUDIT_SINK = Symbol('AUDIT_SINK');

/**
 * The authenticated caller's audit scope (ADR 0018). A route handler copies it from the
 * verified OAuth principal, so every audit entry a request writes is keyed by that client's
 * `projectId` and records that client as `actor`. The deployment holds no project id of its
 * own, so a write outside an authenticated scope has no chain to belong to.
 */
export interface AuditScope {
  readonly projectId: string;
  readonly actor: string;
}

const blank = (value: string): boolean => value.trim() === '';

/** True when a scope cannot key a chain: no project, or no actor to record. */
export function isAuditScopeUsable(scope: AuditScope | undefined): scope is AuditScope {
  return scope !== undefined && !blank(scope.projectId) && !blank(scope.actor);
}

const scopeStorage = new AsyncLocalStorage<AuditScope>();

/**
 * Run one unit of work with an audit scope bound. Anything it awaits, including a shared
 * singleton collaborator, reads the same scope and no other. The API has one scope per
 * request, so a concurrent request from another project cannot be seen.
 */
export function withAuditScope<T>(scope: AuditScope, work: () => Promise<T>): Promise<T> {
  return scopeStorage.run(Object.freeze({ ...scope }), work);
}

/** The bound audit scope, or undefined outside a usable authenticated unit of work. */
export function currentAuditScope(): AuditScope | undefined {
  const scope = scopeStorage.getStore();
  return isAuditScopeUsable(scope) ? scope : undefined;
}
