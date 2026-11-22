import { expect, test } from 'bun:test';
import type { AuditDraft } from '@graveshift/core';

import { AuditTransportError, createAuditHttp } from './audit-http';
import type { HttpFetch } from './types';

const config = {
  apiUrl: 'http://127.0.0.1:3000',
  projectId: 'project-test',
  token: 'internal-audit-test-key-01234567890123456789',
};
const draft: AuditDraft = {
  key: 'actuator:test:admission',
  actor: 'actuator',
  type: 'actuator.admitted',
  payload: { reason: 'admitted' },
};

test('audit transport posts the canonical draft with a separate bearer and validates its ACK', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const audit = createAuditHttp({
    ...config,
    fetchFn: async (url, init) => {
      calls.push({ url: url.href, init });
      return Response.json({ key: draft.key });
    },
  });
  expect(await audit(draft)).toEqual({ key: draft.key });
  expect(calls).toHaveLength(1);
  const request = calls[0];
  expect(request?.url).toBe('http://127.0.0.1:3000/internal/audit');
  expect(request?.init?.method).toBe('POST');
  expect(request?.init?.redirect).toBe('error');
  expect(new Headers(request?.init?.headers).get('authorization')).toBe(`Bearer ${config.token}`);
  expect(request?.init?.signal).toBeInstanceOf(AbortSignal);
  if (typeof request?.init?.body !== 'string') throw new Error('expected a JSON request body');
  expect(JSON.parse(request.init.body)).toEqual({ projectId: config.projectId, draft });
});

test.each([401, 403, 409, 500, 302])(
  'HTTP %s produces a safe classified failure with one call',
  async (status) => {
    const calls: string[] = [];
    const audit = createAuditHttp({
      ...config,
      fetchFn: async (url) => {
        calls.push(url.href);
        return new Response(`Bearer ${config.token}`, { status });
      },
    });
    const error: unknown = await audit(draft).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuditTransportError);
    if (!(error instanceof AuditTransportError))
      throw new Error('expected classified audit failure');
    expect(error.code).toBe('AUDIT_REJECTED');
    expect(error.message).not.toContain(config.token);
    expect(JSON.stringify(error)).not.toContain(config.token);
    expect(calls).toHaveLength(1);
  },
);

test('transport errors cannot expose raw bearer credentials and are not retried', async () => {
  const calls: string[] = [];
  const audit = createAuditHttp({
    ...config,
    fetchFn: async (url) => {
      calls.push(url.href);
      throw new Error(`Bearer ${config.token}`);
    },
  });
  const error: unknown = await audit(draft).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AuditTransportError);
  if (!(error instanceof AuditTransportError)) throw new Error('expected classified audit failure');
  expect(error.code).toBe('AUDIT_UNAVAILABLE');
  expect(String(error)).not.toContain(config.token);
  expect(calls).toHaveLength(1);
});

test.each(['{}', '{"key":"other"}', 'null', 'Bearer raw-response-secret'])(
  'invalid ACK %s cannot pass',
  async (body) => {
    const calls: string[] = [];
    const audit = createAuditHttp({
      ...config,
      fetchFn: async (url) => {
        calls.push(url.href);
        return new Response(body);
      },
    });
    const error: unknown = await audit(draft).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuditTransportError);
    if (!(error instanceof AuditTransportError))
      throw new Error('expected classified audit failure');
    expect(error.code).toBe('AUDIT_ACK_INVALID');
    expect(String(error)).not.toContain('raw-response-secret');
    expect(calls).toHaveLength(1);
  },
);

test('invalid audit configuration and drafts fail before any transport call', async () => {
  const calls: string[] = [];
  const fetchFn: HttpFetch = async (url) => {
    calls.push(url.href);
    return Response.json({ key: draft.key });
  };
  for (const token of ['', 'short', 'replace-me-with-an-internal-secret-that-is-long']) {
    expect(() => createAuditHttp({ ...config, token, fetchFn })).toThrow(AuditTransportError);
  }
  expect(() => createAuditHttp({ ...config, projectId: ' ', fetchFn })).toThrow(
    AuditTransportError,
  );
  for (const apiUrl of [
    'invalid',
    'file:///secret',
    'http://user:password@localhost',
    'http://localhost?q=1',
  ]) {
    expect(() => createAuditHttp({ ...config, apiUrl, fetchFn })).toThrow(AuditTransportError);
  }
  const audit = createAuditHttp({ ...config, fetchFn });
  await expect(audit({ ...draft, key: '' })).rejects.toBeInstanceOf(AuditTransportError);
  expect(calls).toEqual([]);
});
