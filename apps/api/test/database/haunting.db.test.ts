import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { DiagnosisSchema, IncidentSchema } from '@graveshift/core';

import type { PrismaService } from '../../src/infra/prisma.service';
import {
  FIXTURE_AT,
  dbTestEnabled,
  modelCounts,
  openTestDatabase,
  resetDatabase,
} from './fixtures';

const at = new Date(FIXTURE_AT).toISOString();
const diagnosis = DiagnosisSchema.parse({
  id: 'diagnosis-1',
  incidentId: 'haunting-1',
  rootCause: 'Fixture condition',
  evidence: [{ ref: 'signal-1', excerpt: 'Fixture evidence' }],
  confidence: 0.9,
  createdAt: at,
});
const incident = IncidentSchema.parse({
  id: 'haunting-1',
  service: 'fixture',
  state: 'diagnosed',
  signalIds: ['signal-1'],
  diagnosis,
  openedAt: at,
  updatedAt: at,
});
const facts = {
  id: incident.id,
  service: incident.service,
  state: incident.state,
  incident,
  diagnosis,
  detections: [{ signalId: 'signal-1', kind: 'crash_loop' }],
  pr: { repo: 'fixture/repo', number: 1, branch: 'fixture' },
  timeline: [{ type: 'diagnosed', at }],
  openedAt: new Date(at),
  updatedAt: new Date(at),
};
let db: PrismaService;

describe.skipIf(!dbTestEnabled)('Postgres recorded Haunting facts', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('all recorded read facts survive a closed client and a new client', async () => {
    const original = await db.haunting.create({ data: { projectId: 'project-1', ...facts } });
    await db.onModuleDestroy();
    db = await openTestDatabase();
    const restored = await db.haunting.findUniqueOrThrow({
      where: { projectId_id: { projectId: 'project-1', id: incident.id } },
    });
    expect(restored).toEqual(original);
    expect(IncidentSchema.parse(restored.incident)).toEqual(incident);
    expect(DiagnosisSchema.parse(restored.diagnosis)).toEqual(diagnosis);
    expect(restored.detections).toEqual(facts.detections);
    expect(restored.pr).toEqual(facts.pr);
    expect(restored.timeline).toEqual(facts.timeline);
  });

  test('the same Haunting id holds independent facts in two projects', async () => {
    await db.haunting.create({ data: { projectId: 'project-1', ...facts } });
    const other = await db.haunting.create({
      data: { projectId: 'project-2', ...facts, state: 'resolved' },
    });
    await db.haunting.update({
      where: { projectId_id: { projectId: 'project-1', id: incident.id } },
      data: { state: 'acting', timeline: [{ type: 'acting', at }] },
    });
    expect(
      await db.haunting.findUnique({
        where: { projectId_id: { projectId: 'project-2', id: incident.id } },
      }),
    ).toEqual(other);
    expect(
      await db.haunting.findMany({ where: { projectId: 'project-1', service: 'fixture' } }),
    ).toHaveLength(1);
    expect(
      await db.haunting.findMany({ where: { projectId: 'absent', service: 'fixture' } }),
    ).toEqual([]);
  });

  test('reset and counts include Haunting without deleting another model list', async () => {
    await db.haunting.create({ data: { projectId: 'project-1', ...facts } });
    expect(await modelCounts(db)).toMatchObject({ haunting: 1 });
    await resetDatabase(db);
    const first = await modelCounts(db);
    expect(first.haunting).toBe(0);
    expect(Object.values(first).every((count) => count === 0)).toBe(true);
    await resetDatabase(db);
    expect(await modelCounts(db)).toEqual(first);
  });
});
