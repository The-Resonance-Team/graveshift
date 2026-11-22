import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Policy } from '@graveshift/policy';

import * as claims from './claims';
import type { RequiredAudit } from './types';

interface ClaimRow {
  token_id: string;
  request_hash: string;
  action_id: string;
  service: string;
  incident_id: string;
  at: number;
  result_json: string | null;
  result_status: string | null;
  result_reason: string | null;
}

const COUNT_WINDOW_MS = 600_000;

/**
 * File-backed admission. The token row and its service count are committed
 * before the action runs. A restart keeps the row, so an approval token cannot
 * run twice inside or across the approval window.
 */
export class DurableAdmission {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path.length === 0) throw new Error('A durable admission path is required');
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS actuator_claims (
        token_id TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        action_id TEXT NOT NULL,
        service TEXT NOT NULL,
        incident_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        result_json TEXT,
        result_status TEXT,
        result_reason TEXT
      )
    `);
    // Fail at startup, not at the first action, when the store is unusable.
    this.db.prepare('SELECT count(*) AS n FROM actuator_claims').get();
  }

  async claim(
    input: claims.RuntimeClaim,
    policy: Policy,
    now: () => number,
    audit: RequiredAudit,
  ): Promise<claims.ClaimResult> {
    const { request, requestHash } = input;
    const prior = this.row(request.approval.tokenId);
    if (prior !== undefined) return fromPrior(prior, requestHash);

    const draft = claims.claimAudit(input);
    const ack = await audit(structuredClone(draft));
    if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.row(request.approval.tokenId);
      if (existing !== undefined) {
        this.db.exec('COMMIT');
        return fromPrior(existing, requestHash);
      }
      const count = this.serviceCount(request.action.service, now());
      const reason =
        claims.approvalReason(request, policy, now()) ??
        claims.runtimeDecision(policy, request, count);
      if (reason !== undefined) {
        this.db.exec('COMMIT');
        return { kind: 'denied', reason };
      }
      this.db
        .prepare(
          `INSERT INTO actuator_claims
            (token_id, request_hash, action_id, service, incident_id, at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.approval.tokenId,
          requestHash,
          request.action.id,
          request.action.service,
          request.action.incidentId,
          now(),
        );
      this.db.exec('COMMIT');
      return { kind: 'claimed' };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async complete(
    input: claims.RuntimeCompletion,
    audit: RequiredAudit,
  ): Promise<claims.CompletionResult> {
    const prior = this.row(input.tokenId);
    if (prior === undefined || prior.request_hash !== input.requestHash) {
      return { kind: 'uncertain' };
    }
    if (prior.result_json !== null) {
      const result = JSON.parse(prior.result_json) as claims.RuntimeOutcome;
      return { kind: 'known', result };
    }
    const draft = claims.completionAudit(input, prior.service, prior.incident_id);
    const ack = await audit(structuredClone(draft));
    if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
    this.db
      .prepare(
        `UPDATE actuator_claims
         SET result_json = ?, result_status = ?, result_reason = ?
         WHERE token_id = ? AND request_hash = ? AND result_json IS NULL`,
      )
      .run(
        JSON.stringify(input.result),
        input.result.status,
        input.result.reason,
        input.tokenId,
        input.requestHash,
      );
    return { kind: 'completed' };
  }

  private row(tokenId: string): ClaimRow | undefined {
    return this.db.prepare('SELECT * FROM actuator_claims WHERE token_id = ?').get(tokenId) as
      | ClaimRow
      | undefined;
  }

  private serviceCount(service: string, at: number): number {
    const row = this.db
      .prepare(
        `SELECT count(*) AS n FROM actuator_claims
         WHERE service = ? AND (result_json IS NULL OR at > ?)`,
      )
      .get(service, at - COUNT_WINDOW_MS) as { n: number };
    return row.n;
  }
}

export function createDurableAdmission(
  path: string,
  policy: Policy,
  now: () => number,
  audit: RequiredAudit,
): claims.RequiredAdmission {
  const store = new DurableAdmission(path);
  return {
    claim: (input) => store.claim(input, policy, now, audit),
    complete: (input) => store.complete(input, audit),
  };
}

function fromPrior(prior: ClaimRow, requestHash: string): claims.ClaimResult {
  if (prior.request_hash !== requestHash) return { kind: 'uncertain' };
  if (prior.result_json === null) return { kind: 'uncertain' };
  return { kind: 'known', result: JSON.parse(prior.result_json) as claims.RuntimeOutcome };
}
