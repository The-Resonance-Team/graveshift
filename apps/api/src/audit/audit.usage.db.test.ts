import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AuditEvent } from '@graveshift/gateway';
import { Prisma } from '@prisma/client';

import { dbTestEnabled, openTestDatabase, resetDatabase } from '../../test/database/fixtures';
import type { PrismaService } from '../infra/prisma.service';
import { AuditCountersUnavailable } from './audit.errors';
import { AuditRepo } from './audit.repo';
import type { UsageRow } from './audit.types';
import { parsePolicyUsage, usageQuery } from './audit.usage';
import { DATABASE_NOW, UTC_DAY, usageEntry } from './testing/usage-fixture';

function modelPayload(overrides: Partial<AuditEvent> & { service?: string } = {}) {
  return {
    callId: crypto.randomUUID(),
    agent: 'medium',
    task: 'diagnose',
    status: 'ok',
    tokensIn: 10,
    tokensOut: 20,
    costUsd: 0,
    service: 'fixture',
    ...overrides,
  } satisfies AuditEvent & { service: string };
}

let db: PrismaService;
let audit: AuditRepo;

describe.skipIf(!dbTestEnabled)('Postgres policy usage from durable audit', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('an empty project has exactly zero usage', async () => {
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
  });

  test('spend includes all current UTC-day model tasks and services in only this project', async () => {
    await usageEntry(db, { type: 'model.call', payload: modelPayload({ costUsd: 0.1 }) });
    await usageEntry(db, {
      type: 'model.call',
      payload: modelPayload({ costUsd: 0.2, service: 'other' }),
    });
    await usageEntry(db, {
      type: 'model.call',
      payload: modelPayload({ costUsd: 0.3, task: 'patch' }),
    });
    await usageEntry(db, {
      projectId: 'project-2',
      type: 'model.call',
      payload: modelPayload({ costUsd: 90 }),
    });
    await usageEntry(db, {
      projectId: 'project-2',
      type: 'model.call',
      payload: modelPayload({ costUsd: null }),
    });
    await usageEntry(db, { type: 'unrelated', payload: { costUsd: 100 } });
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0.6,
    });
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 4 });
  });

  test.each([
    {},
    { costUsd: null },
    { costUsd: '0' },
    { costUsd: true },
    { costUsd: -0.01 },
    { costUsd: {} },
    { costUsd: [] },
    { usage: { costUsd: 1 } },
  ])('an unknown or invalid current-day model cost fails closed: %j', async (payload) => {
    await usageEntry(db, { type: 'model.call', payload: modelPayload({ costUsd: 1 }) });
    await usageEntry(db, {
      type: 'model.call',
      incidentId: 'different-incident',
      payload: { task: 'patch', service: 'other', ...payload },
    });
    await expect(audit.policyUsage('project-1', 'fixture', 'haunting-1')).rejects.toBeInstanceOf(
      AuditCountersUnavailable,
    );
    await expect(audit.policyUsage('project-1', 'fixture', 'haunting-1')).rejects.toHaveProperty(
      'code',
      'AUDIT_COUNTERS_UNAVAILABLE',
    );
  });

  test('explicit zero costs and rules-only calls remain known usage', async () => {
    await usageEntry(db, {
      type: 'model.call',
      incidentId: 'haunting-1',
      payload: modelPayload({ status: 'rules_only', costUsd: 0 }),
    });
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 1,
      llmSpentTodayUsd: 0,
    });
  });

  test('only the UTC database day contributes, even when the session uses another timezone', async () => {
    await usageEntry(db, {
      type: 'model.call',
      payload: modelPayload({ costUsd: 2 }),
      at: UTC_DAY,
    });
    await usageEntry(db, {
      type: 'model.call',
      payload: modelPayload({ costUsd: null }),
      at: Prisma.sql`${UTC_DAY} - INTERVAL '1 millisecond'`,
    });
    await usageEntry(db, {
      type: 'model.call',
      payload: modelPayload({ costUsd: null }),
      at: Prisma.sql`${UTC_DAY} + INTERVAL '1 day'`,
    });
    const expected = { actionsLast10Min: 0, diagnosisLoops: 0, llmSpentTodayUsd: 2 };
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual(expected);
    const shifted = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Honolulu'`;
      return parsePolicyUsage(
        await tx.$queryRaw<UsageRow[]>(usageQuery('project-1', 'fixture', 'haunting-1')),
      );
    });
    expect(shifted).toEqual(expected);
  });

  test('action admission counts only the selected service within the last ten database minutes', async () => {
    const admitted = { type: 'actuator.admitted', payload: { service: 'fixture' } };
    await usageEntry(db, admitted);
    await usageEntry(db, {
      ...admitted,
      incidentId: 'another-incident',
      at: Prisma.sql`${DATABASE_NOW} - INTERVAL '9 minutes'`,
    });
    await usageEntry(db, { ...admitted, at: Prisma.sql`${DATABASE_NOW} - INTERVAL '11 minutes'` });
    await usageEntry(db, { ...admitted, at: Prisma.sql`${DATABASE_NOW} + INTERVAL '1 hour'` });
    await usageEntry(db, { ...admitted, projectId: 'project-2' });
    await usageEntry(db, { ...admitted, payload: { service: 'other' } });
    await usageEntry(db, { ...admitted, type: 'actuator.executed' });
    await usageEntry(db, { ...admitted, type: 'actuator.denied' });
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 2,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
  });

  test('diagnosis loops include every terminal status over the whole incident lifetime', async () => {
    await ['ok', 'rules_only', 'invalid', 'unavailable'].reduce(
      (prior, status) =>
        prior.then(() =>
          usageEntry(db, {
            type: 'model.call',
            incidentId: 'haunting-1',
            payload: { ...modelPayload(), status },
          }),
        ),
      Promise.resolve(),
    );
    await usageEntry(db, {
      type: 'model.call',
      incidentId: 'haunting-1',
      payload: modelPayload({ costUsd: null }),
      at: Prisma.sql`${UTC_DAY} - INTERVAL '1 day'`,
    });
    await usageEntry(db, {
      type: 'model.call',
      incidentId: 'haunting-1',
      payload: modelPayload({ task: 'patch' }),
    });
    await usageEntry(db, { type: 'model.call', incidentId: 'other', payload: modelPayload() });
    await usageEntry(db, {
      type: 'diagnosis.recorded',
      incidentId: 'haunting-1',
      payload: modelPayload(),
    });
    await usageEntry(db, {
      projectId: 'project-2',
      type: 'model.call',
      incidentId: 'haunting-1',
      payload: modelPayload(),
    });
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 5,
      llmSpentTodayUsd: 0,
    });
    expect((await audit.policyUsage('project-1', 'fixture', 'other')).diagnosisLoops).toBe(1);
  });

  test('quoted project, service, and incident names stay bound values', async () => {
    const projectId = "project' OR true --";
    const service = "service' OR true --";
    const incidentId = "haunting' OR true --";
    await usageEntry(db, { projectId, type: 'actuator.admitted', payload: { service } });
    await usageEntry(db, {
      projectId,
      incidentId,
      type: 'model.call',
      payload: modelPayload({ costUsd: 1 }),
    });
    expect(await audit.policyUsage(projectId, service, incidentId)).toEqual({
      actionsLast10Min: 1,
      diagnosisLoops: 1,
      llmSpentTodayUsd: 1,
    });
    expect(await audit.policyUsage('project-1', 'fixture', 'haunting-1')).toEqual({
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
  });
});
