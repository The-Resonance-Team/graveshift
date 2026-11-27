import { resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '../../../..');

describe('generated API contract', () => {
  test('generated contract is current', () => {
    const result = Bun.spawnSync(['bun', 'run', 'generate:check'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      process.stderr.write(result.stdout.toString());
      process.stderr.write(result.stderr.toString());
    }
    expect(result.exitCode).toBe(0);
  }, 60_000);
});
