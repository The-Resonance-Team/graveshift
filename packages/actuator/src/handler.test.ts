import { expect, test } from 'bun:test';

import { createActionHandler, MAX_ACTION_BODY_BYTES } from './handler';
import { setup, signed, T0 } from './test-helpers';

const actionRequest = (body: string): Request =>
  new Request('http://actuator/actions', { method: 'POST', body });

test('the importable request path serves health and missing routes without audit or runtime calls', async () => {
  const { actuator, calls, audits } = setup();
  const handler = createActionHandler(actuator);
  const health = await handler(new Request('http://actuator/healthz'));
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  expect((await handler(new Request('http://actuator/actions'))).status).toBe(404);
  expect((await handler(new Request('http://actuator/missing'))).status).toBe(404);
  expect(calls).toEqual([]);
  expect(audits).toEqual([]);
});

test.each(['{broken', '', 'null', '[]', '{"nope":true}'])(
  'malformed request %s is denied and audited once',
  async (body) => {
    const { actuator, calls, audits } = setup();
    const response = await createActionHandler(actuator)(actionRequest(body));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      status: 'denied',
      reason: 'malformed_request',
      auditStatus: 'acknowledged',
    });
    expect(calls).toEqual([]);
    expect(audits.map((draft) => draft.type)).toEqual(['actuator.denied']);
  },
);

test('the handler counts UTF-8 bytes rather than JavaScript characters', async () => {
  const { actuator, calls, audits } = setup();
  const handler = createActionHandler(actuator);
  const body = 'é'.repeat(MAX_ACTION_BODY_BYTES / 2 + 1);
  expect(body.length).toBeLessThan(MAX_ACTION_BODY_BYTES);
  const response = await handler(actionRequest(body));
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: 'too large' });
  expect(calls).toEqual([]);
  expect(audits).toEqual([]);
});

test('streamed bodies stop at the byte cap and cancel the unread remainder', async () => {
  const { actuator, calls, audits } = setup();
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(MAX_ACTION_BODY_BYTES));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await createActionHandler(actuator)(
    new Request('http://actuator/actions', {
      method: 'POST',
      body: stream,
      headers: { 'content-length': '1' },
    }),
  );
  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThanOrEqual(3);
  expect(calls).toEqual([]);
  expect(audits).toEqual([]);
});

test('a declared oversize body is rejected without consuming it', async () => {
  const { actuator, calls, audits } = setup();
  const response = await createActionHandler(actuator)(
    new Request('http://actuator/actions', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': String(MAX_ACTION_BODY_BYTES + 1) },
    }),
  );
  expect(response.status).toBe(413);
  expect(calls).toEqual([]);
  expect(audits).toEqual([]);
});

test('an exact-limit valid body keeps the success status and response fields', async () => {
  const { actuator, calls, audits } = setup();
  const body = JSON.stringify(signed()).padEnd(MAX_ACTION_BODY_BYTES, ' ');
  const response = await createActionHandler(actuator)(actionRequest(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: 'executed',
    reason: 'executed',
    auditStatus: 'acknowledged',
  });
  expect(calls).toHaveLength(1);
  expect(audits.map((draft) => draft.type)).toEqual(['actuator.admitted', 'actuator.executed']);
});

test('request stream errors produce a safe 400 response without any admission', async () => {
  const { actuator, calls, audits } = setup();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('Bearer raw-body-secret'));
    },
  });
  const response = await createActionHandler(actuator)(
    new Request('http://actuator/actions', {
      method: 'POST',
      body: stream,
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid body' });
  expect(calls).toEqual([]);
  expect(audits).toEqual([]);
});

test('a backend failure produces a safe 502 and one terminal handoff', async () => {
  const attempts: string[] = [];
  const { actuator, audits } = setup(T0, {
    kube: {
      rolloutRestart: async () => {
        attempts.push('runtime');
        throw new Error('Bearer raw-backend-secret');
      },
      scale: async () => {},
    },
  });
  const response = await createActionHandler(actuator)(actionRequest(JSON.stringify(signed())));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    status: 'failed',
    reason: 'execution_failed',
    auditStatus: 'acknowledged',
  });
  expect(JSON.stringify(audits)).not.toContain('raw-backend-secret');
  expect(audits.map((draft) => draft.type)).toEqual(['actuator.admitted', 'actuator.failed']);
  expect(attempts).toEqual(['runtime']);
});

test('an audit outage before the effect returns 503 and makes no runtime call', async () => {
  const records: string[] = [];
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      records.push(draft.type);
      throw new Error('Bearer raw-audit-secret');
    },
  });
  const response = await createActionHandler(actuator)(actionRequest(JSON.stringify(signed())));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    status: 'failed',
    reason: 'admission_unavailable',
    auditStatus: 'pending',
  });
  expect(calls).toEqual([]);
  expect(records).toEqual(['actuator.admitted']);
});

test('an audit outage after the effect retains HTTP 200 and explicitly reports the pending audit', async () => {
  const records: string[] = [];
  const { actuator, calls } = setup(T0, {
    requiredAudit: async (draft) => {
      records.push(draft.type);
      if (draft.type === 'actuator.executed') throw new Error('Bearer raw-audit-secret');
      return { key: draft.key };
    },
  });
  const response = await createActionHandler(actuator)(actionRequest(JSON.stringify(signed())));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: 'executed',
    reason: 'executed',
    auditStatus: 'pending',
  });
  expect(calls).toHaveLength(1);
  expect(records).toEqual(['actuator.admitted', 'actuator.executed']);
});
