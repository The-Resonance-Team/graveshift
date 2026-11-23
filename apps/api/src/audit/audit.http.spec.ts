import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AuditEntry } from '@graveshift/core';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';

import { AuditBusy, AuditConflict } from './audit.errors';
import type { AuditRepo } from './audit.repo';
import { GENESIS_HASH, hashEntry } from './chain';
import { AUDIT_TEST_PROJECT, AUDIT_TEST_TOKEN, createAuditTestApp } from './testing/audit-http';

const draft = {
  key: 'producer:1',
  actor: 'daemon',
  type: 'model.completed',
  payload: { result: true },
};
const body = { projectId: AUDIT_TEST_PROJECT, draft };
const facts = { ...draft, seq: 1, at: '2026-11-21T00:00:00.000Z' };
const entry: AuditEntry = {
  ...facts,
  prevHash: GENESIS_HASH,
  hash: hashEntry(facts, GENESIS_HASH),
};
const append = mock<AuditRepo['append']>(async () => entry);
let app: INestApplication;

describe('internal audit HTTP boundary', () => {
  beforeEach(async () => {
    append.mockReset();
    append.mockResolvedValue(entry);
    app = await createAuditTestApp({ append });
  });
  afterEach(async () => app.close());

  test.each([undefined, 'Bearer wrong-token', 'Basic fixture', `bearer ${AUDIT_TEST_TOKEN}`])(
    'rejects missing or invalid authentication: %s',
    async (authorization) => {
      const call = request(app.getHttpServer()).post('/internal/audit').send(body);
      if (authorization) call.set('Authorization', authorization);
      const response = await call;
      expect(response.status).toBe(401);
      expect(append).not.toHaveBeenCalled();
    },
  );

  test('rejects another project before it reaches the repository', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send({ ...body, projectId: 'project-2' });
    expect(response.status).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { ...body, projectId: null },
    { ...body, extra: true },
    { ...body, draft: null },
    { ...body, draft: { ...draft, key: '' } },
    { ...body, draft: { ...draft, key: 'x'.repeat(201) } },
    { ...body, draft: { ...draft, actor: 1 } },
    { ...body, draft: { ...draft, type: '' } },
    { ...body, draft: { ...draft, incidentId: null } },
    { ...body, draft: { ...draft, payload: [] } },
    { ...body, draft: { ...draft, payload: null } },
    { ...body, draft: { ...draft, seq: 99 } },
    { ...body, draft: { ...draft, hash: 'producer-hash' } },
  ])('rejects a body outside the strict shared draft contract: %j', async (input) => {
    const response = await request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send(input);
    expect(response.status).toBe(422);
    expect(append).not.toHaveBeenCalled();
  });

  test('authenticates before it reports body validation errors', async () => {
    const response = await request(app.getHttpServer()).post('/internal/audit').send({});
    expect(response.status).toBe(401);
    expect(append).not.toHaveBeenCalled();
  });

  test('passes canonical facts and acknowledges only after the append promise resolves', async () => {
    const entered = Promise.withResolvers<void>();
    const commit = Promise.withResolvers<AuditEntry>();
    append.mockImplementation(() => {
      entered.resolve();
      return commit.promise;
    });
    let acknowledged = false;
    const response = request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send(body)
      .then((result) => {
        acknowledged = true;
        return result;
      });
    await entered.promise;
    try {
      expect(acknowledged).toBe(false);
      expect(append).toHaveBeenCalledWith(AUDIT_TEST_PROJECT, draft);
    } finally {
      commit.resolve(entry);
    }
    const result = await response;
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ key: draft.key });
  });

  test.each([
    { error: new AuditConflict(), status: 409, code: 'AUDIT_KEY_CONFLICT' },
    { error: new AuditBusy(new Error('contention')), status: 503, code: 'AUDIT_RETRY_EXHAUSTED' },
  ])('returns a failed acknowledgement for $code', async ({ error, status, code }) => {
    append.mockRejectedValue(error);
    const response = await request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send(body);
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.body.key).toBeUndefined();
  });

  test('an unacknowledged storage failure cannot return the producer key', async () => {
    append.mockRejectedValue(new Error('storage unavailable'));
    const response = await request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send(body);
    expect(response.status).toBe(500);
    expect(response.body.key).toBeUndefined();
  });

  test('excludes the private controller from the Swagger document', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Fixture').build(),
    );
    expect(document.paths['/internal/audit']).toBeUndefined();
  });
});
