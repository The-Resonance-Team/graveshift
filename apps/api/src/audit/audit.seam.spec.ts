import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AuditDraft, AuditEntry } from '@graveshift/core';
import type { AuditEntry as PrismaAuditEntry } from '@prisma/client';
import { describe, expect, test } from 'bun:test';

import { PrismaInfraModule } from '../infra/prisma.module';
import { PrismaService } from '../infra/prisma.service';
import { InternalAccessModule } from '../internal/internal.module';
import { ProjectGrant } from '../internal/project-grant';
import { AuditRepo } from './audit.repo';
import { AUDIT_READER, AUDIT_SINK, type AuditReader, type AuditSink } from './audit.sink';
import { AuditModule } from './audit.module';

type StoredRow = PrismaAuditEntry & { eventKey: string | null };

/** A fake store behind PrismaService. The test asserts only through the two seam tokens. */
function fakePrisma() {
  const byProject = new Map<string, StoredRow[]>();
  const rows = () => [...byProject.values()].flat();

  const findMany = async (args: { where: { projectId: string } }) =>
    rows()
      .filter((row) => row.projectId === args.where.projectId)
      .sort((left, right) => left.seq - right.seq);

  const tx = {
    $queryRaw: async () => [],
    auditEntry: {
      findUnique: async ({
        where,
      }: {
        where: { projectId_eventKey: { projectId: string; eventKey: string } };
      }) =>
        rows().find(
          (row) =>
            row.projectId === where.projectId_eventKey.projectId &&
            row.eventKey === where.projectId_eventKey.eventKey,
        ) ?? null,
      findFirst: async ({ where }: { where: { projectId: string } }) =>
        rows()
          .filter((row) => row.projectId === where.projectId)
          .sort((left, right) => right.seq - left.seq)[0] ?? null,
      create: async ({ data }: { data: StoredRow }) => {
        byProject.set(data.projectId, [...(byProject.get(data.projectId) ?? []), data]);
        return data;
      },
    },
  };

  const prisma = {
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    $queryRaw: async () => [
      {
        actionsLast10Min: 0n,
        diagnosisLoops: 0n,
        modelCalls: 0n,
        unknownCosts: 0n,
        spentUsd: null,
      },
    ],
    auditEntry: { findMany },
  } as unknown as PrismaService;
  return prisma;
}

const draft = (key: string, payload: Record<string, unknown> = { n: 1 }): AuditDraft => ({
  key,
  actor: 'client-1',
  type: 'policy.decision',
  payload,
});

const build = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({})], cache: true }),
      PrismaInfraModule,
      InternalAccessModule,
      AuditModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma())
    .overrideProvider(ProjectGrant)
    .useValue({ assert: async () => undefined })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
};

describe('one audit append seam', () => {
  test('AUDIT_SINK and AUDIT_READER are one Postgres implementation', async () => {
    const app = await build();
    try {
      const sink = app.get<AuditSink>(AUDIT_SINK);
      const reader = app.get<AuditReader>(AUDIT_READER);
      expect(sink).toBeInstanceOf(AuditRepo);
      expect(Object.is(reader, sink)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('a write through the seam is deduped by eventKey and read back through the reader', async () => {
    const app = await build();
    try {
      const sink = app.get<AuditSink>(AUDIT_SINK);
      const reader = app.get<AuditReader>(AUDIT_READER);

      await sink.append('project-1', draft('proposal:1'));
      await sink.append('project-1', draft('proposal:1', { n: 1 }));
      const chain: AuditEntry[] = await reader.list('project-1');
      expect(chain).toHaveLength(1);
      expect(await reader.verifyChain('project-1')).toEqual({ ok: true, length: 1 });

      await expect(sink.append('project-1', draft('proposal:1', { n: 2 }))).rejects.toHaveProperty(
        'code',
        'AUDIT_KEY_CONFLICT',
      );
      expect(await reader.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
    } finally {
      await app.close();
    }
  });

  test('the seam refuses a write with no authenticated project or actor', async () => {
    const app = await build();
    try {
      const sink = app.get<AuditSink>(AUDIT_SINK);
      const reader = app.get<AuditReader>(AUDIT_READER);
      await expect(
        Promise.resolve().then(() => sink.append('  ', draft('proposal:2'))),
      ).rejects.toThrow('authenticated');
      await expect(
        Promise.resolve().then(() =>
          sink.append('project-1', { ...draft('proposal:2'), actor: ' ' }),
        ),
      ).rejects.toThrow('authenticated');
      expect(await reader.list('project-1')).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
