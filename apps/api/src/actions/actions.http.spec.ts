import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ActionProjectError } from './action.errors';
import type { ActionRepo } from './action.repo';
import { createActionsTestApp } from './testing/action-http.fixture';
import { ACTION_TEST_TOKEN, claimInput, completionInput } from './testing/action.fixture';

const body = claimInput(Date.parse('2026-11-22T00:00:00Z'));
const completion = completionInput(body);
const claim = mock<ActionRepo['claim']>(async () => ({ kind: 'claimed' }));
const complete = mock<ActionRepo['complete']>(async () => ({ kind: 'completed' }));
let app: INestApplication;

describe('internal runtime action boundary', () => {
  beforeEach(async () => {
    claim.mockReset().mockResolvedValue({ kind: 'claimed' });
    complete.mockReset().mockResolvedValue({ kind: 'completed' });
    app = await createActionsTestApp({ claim, complete });
  });
  afterEach(async () => app.close());

  test.each(['claim', 'complete'])('authentication precedes DTO validation on %s', async (path) => {
    const response = await request(app.getHttpServer()).post(`/internal/actions/${path}`).send({});
    expect(response.status).toBe(401);
    expect(claim).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { ...body, projectId: null },
    { ...body, extra: true },
    { ...body, claim: null },
    { ...body, claim: { ...body.claim, maxRate: 999 } },
    { ...body, claim: { ...body.claim, requestHash: 'not-a-hash' } },
    { ...body, claim: { ...body.claim, request: { ...body.claim.request, extra: true } } },
    {
      ...body,
      claim: {
        ...body.claim,
        request: {
          ...body.claim.request,
          approval: { ...body.claim.request.approval, extra: true },
        },
      },
    },
    {
      ...body,
      claim: {
        ...body.claim,
        request: {
          ...body.claim.request,
          action: { ...body.claim.request.action, runtime: 'shell' },
        },
      },
    },
  ])('strict claim DTO rejects %j without a state call', async (input) => {
    const response = await request(app.getHttpServer())
      .post('/internal/actions/claim')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send(input);
    expect(response.status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { ...completion, completion: null },
    { ...completion, extra: true },
    { ...completion, completion: { ...completion.completion, requestHash: '' } },
    {
      ...completion,
      completion: {
        ...completion.completion,
        result: { status: 'executed', reason: 'Bearer raw-secret' },
      },
    },
    {
      ...completion,
      completion: {
        ...completion.completion,
        result: { status: 'failed', reason: 'execution_failed', extra: true },
      },
    },
  ])('strict completion DTO rejects %j without a state call', async (input) => {
    const response = await request(app.getHttpServer())
      .post('/internal/actions/complete')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send(input);
    expect(response.status).toBe(422);
    expect(complete).not.toHaveBeenCalled();
  });

  test('claim ACK waits for the repository transaction and reports newness', async () => {
    const entered = Promise.withResolvers<void>();
    const commit = Promise.withResolvers<{ kind: 'claimed' }>();
    claim.mockImplementation(() => {
      entered.resolve();
      return commit.promise;
    });
    let returned = false;
    const pending = request(app.getHttpServer())
      .post('/internal/actions/claim')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send(body)
      .then((response) => {
        returned = true;
        return response;
      });
    await entered.promise;
    expect(returned).toBe(false);
    expect(claim).toHaveBeenCalledWith(body);
    commit.resolve({ kind: 'claimed' });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'claimed' });
  });

  test.each([
    { kind: 'uncertain' } as const,
    { kind: 'known', result: completion.completion.result } as const,
  ])('known claim response $kind never becomes a new claim', async (result) => {
    claim.mockResolvedValue(result);
    const response = await request(app.getHttpServer())
      .post('/internal/actions/claim')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
  });

  test('complete passes the canonical result intact', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/actions/complete')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send(completion);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'completed' });
    expect(complete).toHaveBeenCalledWith(completion);
  });

  test('a foreign project cannot receive a claim', async () => {
    claim.mockImplementation(async () => {
      throw new ActionProjectError();
    });
    const response = await request(app.getHttpServer())
      .post('/internal/actions/claim')
      .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
      .send({ ...body, projectId: 'foreign' });
    expect(response.status).toBe(403);
    expect(response.body.kind).toBeUndefined();
  });

  test.each(['claim', 'complete'])(
    'storage errors on %s return safe 503 without raw secrets',
    async (path) => {
      claim.mockRejectedValue(new Error('Bearer raw-database-secret'));
      complete.mockRejectedValue(new Error('Bearer raw-database-secret'));
      const response = await request(app.getHttpServer())
        .post(`/internal/actions/${path}`)
        .set('Authorization', `Bearer ${ACTION_TEST_TOKEN}`)
        .send(path === 'claim' ? body : completion);
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('raw-database-secret');
      expect(response.body.kind).toBeUndefined();
    },
  );
});
