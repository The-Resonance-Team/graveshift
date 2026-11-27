import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import type { RecordedHaunting } from '@graveshift/core/recorded';

import { AuditRepo } from '../../src/audit/audit.repo';
import { HauntingRepo } from '../../src/hauntings/haunting.repo';
import { PrismaService } from '../../src/infra/prisma.service';
import {
  dbTestEnabled,
  FIXTURE_AT,
  openTestDatabase,
  resetDatabase,
  testDatabaseUrl,
} from './fixtures';

const ID = 'c3b478e1-4fa8-4988-b3e6-572bd46d8c21';
const timestamp = new Date(FIXTURE_AT).toISOString();
const view = (): RecordedHaunting => ({
  incident: {
    id: ID,
    service: 'api',
    state: 'diagnosed',
    signalIds: ['detection-1'],
    openedAt: timestamp,
    updatedAt: timestamp,
    diagnosis: {
      id: 'diagnosis-1',
      incidentId: ID,
      confidence: 0.8,
      rootCause: 'TypeError contact alice@example.com',
      evidence: [{ ref: 'signal:1', excerpt: 'Bearer privatevalue123456' }],
      createdAt: timestamp,
    },
  },
  severity: 'critical',
  category: 'code_bug',
  detections: [
    {
      id: 'detection-1',
      projectId: 'project-haunting',
      eventId: ID,
      traceId: ID,
      service: 'api',
      rule: 'http.error',
      severity: 'critical',
      fingerprint: 'api:error',
      message: 'contact alice@example.com',
      observedAt: timestamp,
    },
  ],
});

describe.skipIf(!dbTestEnabled)('Recorded Haunting round trips in Postgres', () => {
  let db: PrismaService;
  let repo: HauntingRepo;
  let audit: AuditRepo;

  beforeAll(async () => {
    db = await openTestDatabase();
    await resetDatabase(db);
    audit = new AuditRepo(db);
    repo = new HauntingRepo(db, audit);
  });
  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  test('preserves IDs, private evidence and lookup through a fresh database client', async () => {
    const saved = await repo.upsert('project-haunting', 'observation-1', view());
    expect(saved.incident.id).toBe(ID);
    expect(JSON.stringify(saved)).not.toContain('alice@example.com');
    expect(JSON.stringify(saved)).not.toContain('privatevalue123456');
    const restarted = new PrismaService(new ConfigService({ DATABASE_URL: testDatabaseUrl() }));
    try {
      const reopened = new HauntingRepo(restarted, new AuditRepo(restarted));
      expect(await reopened.get('project-haunting', ID)).toEqual(saved);
      expect((await reopened.context('project-haunting', 'api', 'diagnosis-1'))?.incident.id).toBe(
        ID,
      );
      expect(await reopened.get('foreign-project', ID)).toBeUndefined();
    } finally {
      await restarted.onModuleDestroy();
    }
  });

  test('exact redelivery is idempotent and a changed delivery cannot reuse its event key', async () => {
    const current = await repo.get('project-haunting', ID);
    if (current === undefined) throw new Error('Expected the recorded Haunting');
    expect(await repo.upsert('project-haunting', 'observation-1', view())).toEqual(current);
    expect((await audit.list('project-haunting')).length).toBe(1);
    const changed = view();
    changed.incident.state = 'resolved';
    await expect(repo.upsert('project-haunting', 'observation-1', changed)).rejects.toMatchObject({
      code: 'AUDIT_KEY_CONFLICT',
    });
    expect((await repo.get('project-haunting', ID))?.incident.state).toBe('diagnosed');
  });

  test('resolves an active Grave outside the latest-50 presentation page', async () => {
    const baseline = view();
    const later = '2026-11-22T00:00:00.000Z';
    await db.haunting.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        projectId: 'project-haunting',
        id: `newer-${index}`,
        service: `worker-${index}`,
        state: 'open',
        incident: {
          ...baseline.incident,
          id: `newer-${index}`,
          service: `worker-${index}`,
          state: 'open',
          diagnosis: { ...baseline.incident.diagnosis!, incidentId: `newer-${index}` },
          openedAt: later,
          updatedAt: later,
          auditSeq: 1,
        },
        detections: [],
        timeline: [],
        openedAt: new Date(later),
        updatedAt: new Date(later),
      })),
    });
    expect((await repo.list('project-haunting')).some((entry) => entry.incident.id === ID)).toBe(
      false,
    );
    expect((await repo.active('project-haunting', 'api'))?.incident.id).toBe(ID);
    expect(await repo.active('other-project', 'api')).toBeNull();
  });
});
