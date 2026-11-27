import { describe, expect, test } from 'bun:test';

import { auditFacts, normalizeDraft } from './audit.mapper';

const draft = { key: 'producer:1', actor: 'fixture', type: 'test', payload: { nested: { n: 1 } } };

describe('audit draft facts', () => {
  test('uses JSON storage semantics before hashing and detaches caller-owned payloads', () => {
    const input = { ...draft, payload: { nested: { n: 1 }, absent: undefined, nan: NaN } };
    const normalized = normalizeDraft(input);
    input.payload.nested.n = 2;
    expect(normalized.payload).toEqual({ nested: { n: 1 }, nan: null });
  });

  test('compares semantic facts without the producer key or object insertion order', () => {
    const first = normalizeDraft({ ...draft, payload: { z: 1, a: { c: 3, b: 2 } } });
    const second = normalizeDraft({ ...draft, key: 'other', payload: { a: { b: 2, c: 3 }, z: 1 } });
    expect(auditFacts(first)).toBe(auditFacts(second));
  });

  test.each([
    { ...draft, key: '' },
    { ...draft, key: 'x'.repeat(201) },
    { ...draft, actor: '' },
    { ...draft, type: '' },
    { ...draft, incidentId: '' },
    { ...draft, seq: 99 },
    { ...draft, hash: 'producer-chosen' },
    { ...draft, at: '2026-01-01T00:00:00.000Z' },
  ])('rejects an invalid shared draft: %j', (input) => {
    expect(() => normalizeDraft(input)).toThrow();
  });

  test('a __proto__ payload cannot change the object prototype', () => {
    const normalized = normalizeDraft({
      ...draft,
      payload: JSON.parse('{"__proto__":{"polluted":true},"nested":{"__proto__":{"n":1}},"n":2}'),
    });
    expect(Object.getPrototypeOf(normalized.payload)).toBe(Object.prototype);
    expect(Object.hasOwn(normalized.payload, '__proto__')).toBe(false);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(normalized.payload.n).toBe(2);
  });
});
