import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AuditRepo } from '../../src/audit/audit.repo';
import {
  AUDIT_TEST_PROJECT,
  AUDIT_TEST_TOKEN,
  createAuditTestApp,
} from '../../src/audit/testing/audit-http';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, modelCounts, openTestDatabase, resetDatabase } from './fixtures';

const draft = {
  key: 'daemon:1',
  actor: 'daemon',
  type: 'model.completed',
  payload: { result: true },
};
const body = { projectId: AUDIT_TEST_PROJECT, draft };
let db: PrismaService;
let app: INestApplication;

describe.skipIf(!dbTestEnabled)('Postgres internal audit HTTP acknowledgement', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
    app = await createAuditTestApp(new AuditRepo(db));
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => {
    await app.close();
    await db.onModuleDestroy();
  });

  test('a successful HTTP acknowledgement has already committed for another client', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ key: draft.key });
    const fresh = await openTestDatabase();
    try {
      const audit = new AuditRepo(fresh);
      const entries = await audit.list(AUDIT_TEST_PROJECT);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.payload).toEqual(draft.payload);
      expect(await audit.verifyChain(AUDIT_TEST_PROJECT)).toEqual({ ok: true, length: 1 });
    } finally {
      await fresh.onModuleDestroy();
    }
  });

  test('duplicate delivery returns an acknowledgement but different facts conflict', async () => {
    const post = (input: typeof body) =>
      request(app.getHttpServer())
        .post('/internal/audit')
        .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
        .send(input);
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).body).toEqual({ key: draft.key });
    const conflict = await post({ ...body, draft: { ...draft, actor: 'different' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('AUDIT_KEY_CONFLICT');
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 1 });
  });

  test('auth, project, and body failures create no durable audit entry', async () => {
    expect((await request(app.getHttpServer()).post('/internal/audit').send(body)).status).toBe(
      401,
    );
    expect(
      (
        await request(app.getHttpServer())
          .post('/internal/audit')
          .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
          .send({ ...body, projectId: 'project-2' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .post('/internal/audit')
          .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
          .send({ ...body, draft: { ...draft, seq: 99 } })
      ).status,
    ).toBe(422);
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 0 });
  });
});
