import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import {
  EnvelopeError,
  type EnvelopeErrorCode,
  type EventEnvelope,
  EventEnvelopeSchema,
  prepareEnvelope,
} from './index';

const envelope: EventEnvelope = {
  id: 'evt-1',
  projectId: 'project-1',
  source: 'plugin.test',
  service: 'api',
  type: 'http.request',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:http',
  payload: {},
};

function expectFailure(input: unknown, code: EnvelopeErrorCode): void {
  try {
    prepareEnvelope(input);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error('Expected envelope rejection');
}

describe('prepareEnvelope', () => {
  test('keeps UUID identity, routing, trace relationships and fingerprint equality', () => {
    const traceId = crypto.randomUUID();
    const fingerprint = crypto.randomUUID();
    const inputs = [crypto.randomUUID(), crypto.randomUUID()].map((id) => ({
      ...envelope,
      id,
      projectId: 'project_1',
      service: 'checkout api',
      type: 'http.request.finished',
      traceId,
      fingerprint,
    }));
    expect(inputs.map(prepareEnvelope)).toEqual(inputs);
    expect(new Set(inputs.map((input) => prepareEnvelope(input).id)).size).toBe(2);
  });

  test('keeps valid UUIDs whose digits resemble a phone number', () => {
    const id = '9b67e2a4-8c15-4f09-a2d6-ab0912345678';
    const input = { ...envelope, id, traceId: id, fingerprint: id };
    expect(prepareEnvelope(input)).toEqual(input);
  });

  for (const field of ['id', 'projectId', 'service', 'type', 'traceId', 'fingerprint']) {
    test(`rejects a recognized secret in ${field}`, () => {
      expectFailure(
        { ...envelope, [field]: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
        'SENSITIVE_METADATA',
      );
    });
  }

  for (const value of [
    'ops@example.com',
    '+84 912 345 678',
    'Bearer abcdefgh1234',
    'Basic dXNlcjpwYXNzMQ==',
    'postgres://admin:password@db.internal/app',
    'AKIAABCDEFGHIJKLMNOP',
    'eyJabcdefghijk.abcdefghijkl.abcdefghijkl',
    'DB_PASSWORD=short',
    '-----BEGIN PRIVATE KEY-----\nshort\n-----END PRIVATE KEY-----',
  ]) {
    test(`rejects sensitive identity format ${value.split(' ')[0]}`, () => {
      expectFailure({ ...envelope, traceId: value }, 'SENSITIVE_METADATA');
    });
  }

  test('redacts source and nested free text without changing input', () => {
    const input = {
      ...envelope,
      source: 'plugin ops@example.com',
      payload: {
        message: 'Bearer abcdefgh1234',
        nested: [{ message: 'DB_PASSWORD=short', count: 2 }, 'ops@example.com'],
        nullable: null,
        enabled: true,
      },
    };
    const prepared = prepareEnvelope(input);
    expect(prepared.source).toBe('plugin [REDACTED:email]');
    expect(prepared.payload).toEqual({
      message: 'Bearer [REDACTED:bearer]',
      nested: [{ message: 'DB_PASSWORD=[REDACTED:env]', count: 2 }, '[REDACTED:email]'],
      nullable: null,
      enabled: true,
    });
    expect(input.payload.message).toBe('Bearer abcdefgh1234');
    expect(prepareEnvelope(prepared)).toEqual(prepared);
  });

  test('drops sensitive keys and their values without merging distinct keys', () => {
    const payload = {
      authorization: 'short bearer credential',
      apiKey: 'opaque api credential',
      password: 'opaque password',
      userEmail: 'opaque personal value',
      nested: {
        'first@example.com': 'first private field',
        'second@example.com': 'second private field',
        '9b67e2a48c154f09a2d63e851b740c9f': 'third private field',
        e7c463b1d0a84f25919ea236b17cf810: 'fourth private field',
        '[REDACTED:entropy]': 'existing marker key',
        first: 1,
        second: 2,
      },
    };
    const prepared = prepareEnvelope({ ...envelope, payload });
    expect(prepared.payload).toEqual({
      nested: { '[REDACTED:entropy]': 'existing marker key', first: 1, second: 2 },
    });
    const serialized = JSON.stringify(prepared);
    for (const value of ['authorization', 'apiKey', 'password', '@example.com', 'private field']) {
      expect(serialized).not.toContain(value);
    }
  });

  test('accepts a shared child without treating it as a cycle', () => {
    const child = { message: 'ops@example.com' };
    expect(
      prepareEnvelope({ ...envelope, payload: { first: child, second: child } }).payload,
    ).toEqual({
      first: { message: '[REDACTED:email]' },
      second: { message: '[REDACTED:email]' },
    });
  });

  const unsupported = [
    ['undefined', undefined],
    ['function', () => 'hidden'],
    ['symbol', Symbol('hidden')],
    ['bigint', 1n],
    ['NaN', NaN],
    ['positive infinity', Infinity],
    ['negative infinity', -Infinity],
    ['Date', new Date('2026-11-20T10:00:00.000Z')],
    ['Map', new Map([['value', 'hidden']])],
  ] as const;
  for (const [name, value] of unsupported) {
    test(`rejects ${name} in payload objects and arrays`, () => {
      expectFailure({ ...envelope, payload: { nested: { value } } }, 'INVALID_JSON_PAYLOAD');
      expectFailure({ ...envelope, payload: { nested: [value] } }, 'INVALID_JSON_PAYLOAD');
    });
  }

  test('rejects invalid data even under a sensitive key', () => {
    expectFailure({ ...envelope, payload: { password: undefined } }, 'INVALID_JSON_PAYLOAD');
  });

  test('rejects object and array cycles', () => {
    const payload: Record<string, unknown> = {};
    payload['cycle'] = payload;
    expectFailure({ ...envelope, payload }, 'INVALID_JSON_PAYLOAD');
    const items: unknown[] = [];
    items.push(items);
    expectFailure({ ...envelope, payload: { items } }, 'INVALID_JSON_PAYLOAD');
  });

  test('rejects symbol keys, sparse arrays and hidden object fields', () => {
    expectFailure(
      { ...envelope, payload: { [Symbol('hidden')]: 'value' } },
      'INVALID_JSON_PAYLOAD',
    );
    expectFailure({ ...envelope, payload: { items: new Array(2) } }, 'INVALID_JSON_PAYLOAD');
    const payload = Object.defineProperty({}, 'hidden', { value: 'value' });
    expectFailure({ ...envelope, payload }, 'INVALID_JSON_PAYLOAD');
  });

  test('rejects accessors and toJSON without invoking application code', () => {
    let calls = 0;
    const payload = {
      get value() {
        calls++;
        return 'hidden';
      },
    };
    expectFailure({ ...envelope, payload }, 'INVALID_JSON_PAYLOAD');
    expectFailure({ ...envelope, payload: { toJSON: () => calls++ } }, 'INVALID_JSON_PAYLOAD');
    expect(calls).toBe(0);
  });

  test('rejects bad raw shape before publication', () => {
    expectFailure({ ...envelope, observedAt: 'yesterday' }, 'INVALID_ENVELOPE');
    expectFailure(null, 'INVALID_ENVELOPE');
    expectFailure({ ...envelope, payload: [] }, 'INVALID_JSON_PAYLOAD');
  });

  test('property: every accepted JSON representation passes the canonical schema', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 30 }), fc.jsonValue()), (payload) => {
        const prepared = prepareEnvelope({ ...envelope, payload });
        const serialized: unknown = JSON.parse(JSON.stringify(prepared));
        expect(EventEnvelopeSchema.parse(serialized)).toEqual(prepared);
        expect(prepareEnvelope(prepared)).toEqual(prepared);
      }),
      { numRuns: 200 },
    );
  });
});
