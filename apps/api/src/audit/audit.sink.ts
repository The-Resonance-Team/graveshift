import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuditDraft, AuditEntry } from '@graveshift/core';
import type { Prisma } from '@prisma/client';

import type { AuditPage, PolicyUsage, VerifyResult } from './audit.types';

/** The caller-owned database unit an audit write can join. The in-memory adapter ignores it. */
export type AuditTransaction = Prisma.TransactionClient;

/**
 * One audit write request. `projectId` is the scope from ADR 0018: every audit entry
 * carries it, and the hash chain is keyed by it.
 */
export interface AuditRecord extends AuditDraft {
  readonly projectId: string;
}

/**
 * The one append seam for an audit write from a use case. `AUDIT_SINK` is its token.
 * `AuditRepo` is the Postgres adapter in production; `InMemoryAuditSink` is the adapter in
 * tests. Both own no chain of their own: the adapter behind the seam owns the chain, the
 * eventKey dedup, the serializable retry and the authenticated scope check.
 */
export interface AuditSink {
  /** Append one entry in its own serializable, retryable transaction. */
  append(projectId: string, draft: AuditDraft): Promise<AuditEntry>;
  /** Append one entry inside the caller's transaction, so the entry commits with its facts. */
  appendInTx(tx: AuditTransaction, projectId: string, draft: AuditDraft): Promise<AuditEntry>;
  /** Run one serializable, retryable write unit owned by the adapter. */
  transaction<Result>(work: (tx: AuditTransaction) => Promise<Result>): Promise<Result>;
}

/** The read side of the same owner. `AUDIT_READER` is its token. */
export interface AuditReader {
  list(projectId: string, page?: AuditPage): Promise<AuditEntry[]>;
  verifyChain(projectId: string): Promise<VerifyResult>;
  policyUsage(projectId: string, service: string, incidentId: string): Promise<PolicyUsage>;
}

export const AUDIT_SINK = Symbol('AUDIT_SINK');
export const AUDIT_READER = Symbol('AUDIT_READER');

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
