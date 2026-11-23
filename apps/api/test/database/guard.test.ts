import { describe, expect, test } from 'bun:test';

import { FIXTURE_AT, FIXTURE_TIMEZONE } from './fixtures';
import { assertTestDatabase } from './guard';

const runId = '1'.repeat(32);
const local = {
  optIn: '1',
  runId,
  url: `postgresql://gs_test:throwaway@127.0.0.1:55555/graveshift_test_${runId}`,
};

describe('isolated database guard', () => {
  test('accepts only the named local throwaway database', () => {
    expect(assertTestDatabase(local)).toBe(local.url);
  });

  test.each([
    { optIn: undefined },
    { optIn: 'true' },
    { ci: 'true' },
    { runId: undefined },
    { runId: '../other' },
    { url: undefined },
    { url: local.url.replace('127.0.0.1', 'db.example.com') },
    { url: local.url.replace('127.0.0.1', 'localhost') },
    { url: local.url.replace('gs_test:', 'postgres:') },
    { url: local.url.replace(`graveshift_test_${runId}`, 'postgres') },
    { url: local.url.replace(':55555', ':543') },
    { url: local.url.replace(':55555', '') },
    { url: local.url.replace('throwaway', '') },
    { url: `${local.url}?host=remote.example.com` },
    { url: `${local.url}#foreign` },
    { url: local.url.replace('postgresql:', 'https:') },
  ])('rejects unsafe config %j before connecting', (change) => {
    expect(() => assertTestDatabase({ ...local, ...change })).toThrow();
  });

  test('the timezone anchor identifies the same instant under UTC', () => {
    expect(FIXTURE_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
    expect(new Date(FIXTURE_AT).toISOString()).toBe('2026-11-21T00:00:00.000Z');
  });
});
