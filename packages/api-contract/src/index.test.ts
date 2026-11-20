import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { API_CONTRACT_VERSION, type HealthResponse } from './index.js';

describe('api contract', () => {
  test('generated types file exists', () => {
    expect(existsSync(new URL('./generated/api.ts', import.meta.url))).toBe(true);
  });

  test('exports the health response type', () => {
    const response: HealthResponse = { status: 'ok' };
    expect(response.status).toBe('ok');
    expect(API_CONTRACT_VERSION).toBe('0.1.0');
  });
});
