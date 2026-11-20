import type { Database } from 'bun:sqlite';
import { type AuditEntry, AuditEntrySchema } from '@graveshift/core';
import { asc, desc, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { GENESIS_HASH, hashEntry, verifyEntries, type VerifyResult } from './chain';

export type AuditInput = Pick<AuditEntry, 'actor' | 'type' | 'payload'> &
  Pick<Partial<AuditEntry>, 'incidentId'>;

export interface AuditStore {
  append(input: AuditInput): Promise<AuditEntry>;
  list(opts?: { afterSeq?: number; limit?: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<VerifyResult>;
}

export const auditLog = sqliteTable('audit_log', {
  seq: integer('seq').primaryKey(),
  at: text('at').notNull(),
  actor: text('actor').notNull(),
  type: text('type').notNull(),
  incidentId: text('incident_id'),
  payload: text('payload').notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
});

// ponytail: inline DDL for a single table, upgrade to drizzle-kit migrations if the schema changes or Postgres lands
const DDL = `
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL,
  incident_id TEXT, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;

const toEntry = (row: typeof auditLog.$inferSelect): AuditEntry =>
  AuditEntrySchema.parse({
    seq: row.seq,
    at: row.at,
    actor: row.actor,
    type: row.type,
    ...(row.incidentId === null ? {} : { incidentId: row.incidentId }),
    payload: JSON.parse(row.payload),
    prevHash: row.prevHash,
    hash: row.hash,
  });

export function createSqliteAuditStore(
  sqlite: Database,
  now: () => Date = () => new Date(),
): AuditStore {
  sqlite.exec(DDL);
  const db = drizzle(sqlite);
  const readAll = () => db.select().from(auditLog).orderBy(asc(auditLog.seq)).all().map(toEntry);

  return {
    async append(input) {
      // zod parse drops keys such as __proto__, so the hashed payload equals what is read back
      const payload = AuditEntrySchema.shape.payload.parse(
        JSON.parse(JSON.stringify(input.payload)),
      );
      return db.transaction(
        (tx) => {
          const last = tx.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1).get();
          const prevHash = last?.hash ?? GENESIS_HASH;
          const draft = {
            seq: (last?.seq ?? 0) + 1,
            at: now().toISOString(),
            actor: input.actor,
            type: input.type,
            payload,
            ...(input.incidentId === undefined ? {} : { incidentId: input.incidentId }),
          };
          const entry = AuditEntrySchema.parse({
            ...draft,
            prevHash,
            hash: hashEntry(draft, prevHash),
          });
          tx.insert(auditLog)
            .values({
              seq: entry.seq,
              at: entry.at,
              actor: entry.actor,
              type: entry.type,
              incidentId: entry.incidentId ?? null,
              payload: JSON.stringify(entry.payload),
              prevHash: entry.prevHash,
              hash: entry.hash,
            })
            .run();
          return entry;
        },
        { behavior: 'immediate' },
      );
    },

    async list({ afterSeq = 0, limit = 100 } = {}) {
      return db
        .select()
        .from(auditLog)
        .where(gt(auditLog.seq, afterSeq))
        .orderBy(asc(auditLog.seq))
        .limit(limit)
        .all()
        .map(toEntry);
    },

    async verifyChain() {
      return verifyEntries(readAll());
    },
  };
}
