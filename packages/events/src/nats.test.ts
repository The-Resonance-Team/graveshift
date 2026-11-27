import { describe, expect, test } from 'bun:test';

describe('connectNatsReader resource ownership', () => {
  for (const mode of ['manager-failure', 'connect-failure', 'success']) {
    test(mode, async () => {
      // Module mocks run in a child process so real NATS imports in other tests stay intact.
      const child = Bun.spawn({
        cmd: [process.execPath, `${import.meta.dir}/test-fixtures/nats-reader.ts`, mode],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect({ status, stdout, stderr }).toEqual({ status: 0, stdout: '', stderr: '' });
    });
  }
});
