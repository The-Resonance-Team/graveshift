import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import * as claims from './claims';

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
 * before the action runs. A restart keeps the row, so neither an approval token
 * nor a second token for the same action can run the effect again.
 */
export class DurableAdmission {
  private readonly db: DatabaseSync;
  private readonly rules: claims.AdmissionRules;
  private readonly maxTracked: number;

  constructor(path: string, rules: claims.AdmissionRules) {
    if (path.length === 0) throw new Error('A durable admission path is required');
    this.rules = rules;
    this.maxTracked = claims.checkCapacity(rules.maxTrackedActions);
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
      );
      CREATE UNIQUE INDEX IF NOT EXISTS actuator_claims_action_id
        ON actuator_claims(action_id);
    `);
    // Fail at startup, not at the first action, when the store is unusable.
    this.db.prepare('SELECT count(*) AS n FROM actuator_claims').get();
  }

  async claim(input: claims.RuntimeClaim): Promise<claims.ClaimResult> {
    const { request, requestHash } = input;
    const prior = this.row(request.approval.tokenId, request.action.id);
    if (prior !== undefined) return fromPrior(prior, requestHash);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.row(request.approval.tokenId, request.action.id);
      if (existing !== undefined) {
        this.db.exec('COMMIT');
        return fromPrior(existing, requestHash);
      }
      const at = this.rules.now();
      const count = this.serviceCount(request.action.service, at);
      const reason = claims.admissionDecision(request, this.rules, count);
      if (reason !== undefined) {
        this.db.exec('COMMIT');
        return { kind: 'denied', reason };
      }
      if (this.claimCount(at) >= this.maxTracked) {
        this.db.exec('COMMIT');
        return { kind: 'denied', reason: 'admission_capacity' };
      }
      // Only a claim that actually commits emits the admitted audit.
      const draft = claims.claimAudit(input);
      const ack = await this.rules.audit(structuredClone(draft));
      if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
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
          at,
        );
      this.db.exec('COMMIT');
      return { kind: 'claimed' };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async recheck(input: claims.RuntimeClaim): Promise<claims.DenyReason | undefined> {
    return claims.lateEligibilityReason(input.request, this.rules);
  }

  async complete(input: claims.RuntimeCompletion): Promise<claims.CompletionResult> {
    const prior = this.row(input.tokenId, input.actionId);
    if (prior === undefined || prior.request_hash !== input.requestHash) {
      return { kind: 'uncertain' };
    }
    if (prior.result_json !== null) {
      const result = JSON.parse(prior.result_json) as claims.RuntimeOutcome;
      return { kind: 'known', result };
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db
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
      if (updated.changes !== 1) {
        this.db.exec('COMMIT');
        return { kind: 'uncertain' };
      }
      const draft = claims.completionAudit(input, prior.service, prior.incident_id);
      const ack = await this.rules.audit(structuredClone(draft));
      if (ack.key !== draft.key) throw new Error('audit acknowledgement mismatch');
      this.db.exec('COMMIT');
      return { kind: 'completed' };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private row(tokenId: string, actionId: string): ClaimRow | undefined {
    return this.db
      .prepare('SELECT * FROM actuator_claims WHERE token_id = ? OR action_id = ?')
      .get(tokenId, actionId) as ClaimRow | undefined;
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

  private claimCount(at: number): number {
    const row = this.db
      .prepare(
        `SELECT count(*) AS n FROM actuator_claims
         WHERE result_json IS NULL OR at > ?`,
      )
      .get(at - COUNT_WINDOW_MS) as { n: number };
    return row.n;
  }
}

function fromPrior(prior: ClaimRow, requestHash: string): claims.ClaimResult {
  if (prior.request_hash !== requestHash) return { kind: 'uncertain' };
  if (prior.result_json === null) return { kind: 'uncertain' };
  return { kind: 'known', result: JSON.parse(prior.result_json) as claims.RuntimeOutcome };
}
