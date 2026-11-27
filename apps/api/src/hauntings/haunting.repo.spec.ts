import type { RecordedHaunting } from '@graveshift/core/recorded';
import { Test } from '@nestjs/testing';
import { describe, expect, mock, test } from 'bun:test';

import { AuditConflict } from '../audit/audit.errors';
import { AUDIT_SINK } from '../audit/audit.sink';
import { PrismaService } from '../infra/prisma.service';
import { HauntingConflict } from './haunting.errors';
import { hauntingData } from './haunting.mapper';
import { HauntingRepo } from './haunting.repo';
import { HAUNTING_FIXTURE, HAUNTING_SECRET } from './testing/haunting.fixture';

const row = {
  ...hauntingData(HAUNTING_FIXTURE, 2),
  projectId: 'project-1',
  diagnosis: HAUNTING_FIXTURE.incident.diagnosis ?? null,
  pr: HAUNTING_FIXTURE.pr ?? null,
};

async function setup() {
  const findUnique = mock(async () => row);
  const findMany = mock(async () => [row]);
  const findFirst = mock(async () => row);
  const upsert = mock(async () => row);
  const tx = { haunting: { findUnique, findMany, findFirst, upsert } };
  const transaction = mock(async (task: (client: typeof tx) => Promise<RecordedHaunting>) =>
    task(tx),
  );
  const appendInTx = mock(async () => ({ seq: 1 }));
  const moduleRef = await Test.createTestingModule({
    providers: [
      HauntingRepo,
      { provide: PrismaService, useValue: { ...tx, $transaction: transaction } },
      { provide: AUDIT_SINK, useValue: { appendInTx } },
    ],
  }).compile();
  return { moduleRef, repo: moduleRef.get(HauntingRepo), tx, transaction, appendInTx };
}

describe('HauntingRepo ownership and redelivery', () => {
  test('an older acknowledged event cannot overwrite a later recorded view', async () => {
    const fixture = await setup();
    try {
      expect(await fixture.repo.upsert('project-1', 'event-1', HAUNTING_FIXTURE)).toEqual(
        HAUNTING_FIXTURE,
      );
      expect(fixture.tx.haunting.upsert).not.toHaveBeenCalled();
      expect(fixture.tx.haunting.findUnique).toHaveBeenCalledWith({
        where: { projectId_id: { projectId: 'project-1', id: 'haunting-1' } },
        select: expect.any(Object),
      });
      expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
        maxWait: 10_000,
        timeout: 15_000,
      });
    } finally {
      await fixture.moduleRef.close();
    }
  });

  test('a new event writes only after its audit and keeps full safe facts', async () => {
    const fixture = await setup();
    fixture.appendInTx.mockResolvedValue({ seq: 3 });
    try {
      await fixture.repo.upsert('project-1', 'event-3', HAUNTING_FIXTURE);
      expect(fixture.appendInTx).toHaveBeenCalledWith(fixture.tx, 'project-1', {
        key: 'haunting:event-3',
        actor: 'daemon',
        type: 'haunting.recorded',
        incidentId: 'haunting-1',
        payload: {
          view: HAUNTING_FIXTURE,
          deploymentId: HAUNTING_FIXTURE.deploymentId,
        },
      });
      expect(fixture.tx.haunting.upsert).toHaveBeenCalledWith({
        where: { projectId_id: { projectId: 'project-1', id: 'haunting-1' } },
        create: { projectId: 'project-1', ...hauntingData(HAUNTING_FIXTURE, 3) },
        update: hauntingData(HAUNTING_FIXTURE, 3),
        select: expect.any(Object),
      });
      expect(JSON.stringify(fixture.tx.haunting.upsert.mock.calls)).not.toContain(HAUNTING_SECRET);
    } finally {
      await fixture.moduleRef.close();
    }
  });

  test('a reused event key with different facts fails before a Haunting write', async () => {
    const fixture = await setup();
    fixture.appendInTx.mockRejectedValue(new AuditConflict());
    try {
      await expect(fixture.repo.upsert('project-1', 'event-1', HAUNTING_FIXTURE)).rejects.toThrow(
        AuditConflict,
      );
      expect(fixture.tx.haunting.upsert).not.toHaveBeenCalled();
    } finally {
      await fixture.moduleRef.close();
    }
  });

  test('rejects foreign Detection ownership before the transaction', async () => {
    const fixture = await setup();
    try {
      await expect(fixture.repo.upsert('project-2', 'event-1', HAUNTING_FIXTURE)).rejects.toThrow(
        HauntingConflict,
      );
      expect(fixture.transaction).not.toHaveBeenCalled();
    } finally {
      await fixture.moduleRef.close();
    }
  });

  test('a new event cannot replace immutable identity or newer facts', async () => {
    const fixture = await setup();
    fixture.appendInTx.mockResolvedValue({ seq: 3 });
    try {
      const inputs = [
        {
          ...HAUNTING_FIXTURE,
          detections: [],
          incident: { ...HAUNTING_FIXTURE.incident, service: 'foreign' },
        },
        {
          ...HAUNTING_FIXTURE,
          incident: { ...HAUNTING_FIXTURE.incident, openedAt: '2026-11-20T00:00:00.000Z' },
        },
      ];
      await Promise.all(
        inputs.map((view) =>
          expect(fixture.repo.upsert('project-1', 'event-3', view)).rejects.toThrow(
            HauntingConflict,
          ),
        ),
      );
      expect(fixture.tx.haunting.upsert).not.toHaveBeenCalled();
    } finally {
      await fixture.moduleRef.close();
    }
  });

  test('qualifies list, get and Diagnosis context queries with the project', async () => {
    const fixture = await setup();
    try {
      expect(await fixture.repo.list('project-1', 2)).toEqual([HAUNTING_FIXTURE]);
      expect(await fixture.repo.get('project-1', 'haunting-1')).toEqual(HAUNTING_FIXTURE);
      expect(await fixture.repo.context('project-1', 'api', 'diagnosis-1')).toEqual(
        HAUNTING_FIXTURE,
      );
      expect(fixture.tx.haunting.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
        take: 2,
        select: expect.any(Object),
      });
      expect(fixture.tx.haunting.findFirst).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          service: 'api',
          diagnosis: { path: ['id'], equals: 'diagnosis-1' },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: expect.any(Object),
      });
    } finally {
      await fixture.moduleRef.close();
    }
  });
});
