import { describe, expect, test } from 'bun:test';

import type { AuditRecord } from '../audit.sink';
import { InMemoryAuditSink } from './in-memory-audit.sink';

const record = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  projectId: '12345',
  key: 'fix:attempt-1:outcome',
  actor: 'client-1',
  type: 'fix.outcome',
  payload: { ok: true, failure: 'none' },
  ...overrides,
});

const append = (sink: InMemoryAuditSink, overrides: Partial<AuditRecord> = {}) => {
  const input = record(overrides);
  return Promise.resolve()
    .then(() => sink.append(input.projectId, input))
    .then(() => input);
};

describe('in-memory audit sink', () => {
  test('keeps one chain per Project so a test cannot pass on a leaked write', async () => {
    const sink = new InMemoryAuditSink();
    await append(sink);
    await append(sink, { projectId: '12346', key: 'fix:attempt-2:outcome' });
    expect(sink.projects().sort()).toEqual(['12345', '12346']);
    expect(sink.entries('12345').map((entry) => entry.key)).toEqual(['fix:attempt-1:outcome']);
    expect(sink.entries('12346').map((entry) => entry.key)).toEqual(['fix:attempt-2:outcome']);
    expect(sink.entries('nobody')).toEqual([]);
  });

  test('detaches the stored record from the caller object', async () => {
    const sink = new InMemoryAuditSink();
    const input = await append(sink);
    (input.payload as { ok: boolean }).ok = false;
    expect(sink.entries('12345')[0]?.payload).toEqual({ ok: true, failure: 'none' });
  });

  test('appends one entry per key, so an idempotent replay audits the attempt once', async () => {
    const sink = new InMemoryAuditSink();
    await append(sink);
    await append(sink);
    expect(sink.ofType('fix.outcome')).toHaveLength(1);
  });

  test('refuses a record the real sink would refuse', async () => {
    const sink = new InMemoryAuditSink();
    await expect(append(sink, { projectId: ' ' })).rejects.toThrow('authenticated');
    await expect(append(sink, { actor: '' })).rejects.toThrow('authenticated');
    expect(sink.projects()).toEqual([]);
  });

  test('fails the selected audit stage only', async () => {
    const down = new Error('chain unavailable');
    const sink = new InMemoryAuditSink({
      failWith: down,
      failWhen: (entry) => entry.type === 'fix.outcome',
    });
    await expect(append(sink)).rejects.toBe(down);
    await expect(append(sink, { type: 'policy.decision', key: 'p:1' })).resolves.toBeDefined();
    expect(sink.ofType('fix.outcome')).toEqual([]);
  });
});
