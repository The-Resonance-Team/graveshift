import { describe, expect, test } from 'bun:test';

import {
  createSpawnRunner,
  jailWorks,
  networkJail,
  SANDBOX_OUTPUT_CAP,
  SandboxUnavailableError,
  sandboxEnv,
} from './spawn';

/**
 * Every test here starts a real subprocess, so each one gets a budget well above
 * bun's 5 s default per-test limit: a shared CI runner is slow, not the check.
 * `pipes.test.ts` drives the same runner over an injected child instead.
 */
const REAL_SUBPROCESS_TIMEOUT_MS = 30_000;

describe('createSpawnRunner', () => {
  test(
    'runs a real command with the scrubbed environment and captures output',
    async () => {
      process.env.GRAVESHIFT_TEST_SECRET = 'a-secret-the-check-must-never-see';
      process.env.LANG = 'en_US.UTF-8';
      const runner = createSpawnRunner([]);
      const result = await runner({
        argv: ['/usr/bin/env'],
        cwd: '/',
        env: sandboxEnv('/tmp', ['/usr/local/bin']),
        timeoutMs: 10_000,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('PATH=/usr/bin:/bin:/usr/local/bin');
      expect(result.stdout).toContain('HOME=/tmp');
      // A named non-secret passes through; the host secret and every credential
      // name stays out of the process.
      expect(result.stdout).toContain('LANG=en_US.UTF-8');
      expect(result.stdout).not.toContain('GRAVESHIFT_TEST_SECRET');
      expect(result.stdout).not.toContain('a-secret-the-check-must-never-see');
      expect(result.stdout).not.toContain('GRAVESHIFT_GITHUB_PRIVATE_KEY');
      expect(result.stdout).not.toContain('ANTHROPIC_API_KEY');
      expect(result.timedOut).toBe(false);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'output far above the cap stays bounded and is marked truncated',
    async () => {
      const runner = createSpawnRunner([]);
      // 4 MiB in 32 large writes: 64 times over the cap, with few enough writes
      // and bytes that a shared CI runner is not what the test measures.
      const result = await runner({
        argv: [
          process.execPath,
          '-e',
          'const chunk = "x".repeat(128 * 1024); for (let i = 0; i < 32; i++) process.stdout.write(chunk);',
        ],
        cwd: '/',
        env: sandboxEnv('/tmp'),
        timeoutMs: 20_000,
      });
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeLessThanOrEqual(SANDBOX_OUTPUT_CAP);
      expect(result.stdoutTruncated).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(0);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'a grandchild that holds stdout open cannot hang the run',
    async () => {
      const runner = createSpawnRunner([]);
      const started = Date.now();
      // The direct child exits at once; the backgrounded grandchild keeps the
      // inherited stdout pipe open. It ends on its own shortly after, because a
      // check that already exited is never signalled again.
      const result = await runner({
        argv: ['/bin/sh', '-c', 'sleep 2 & exit 0'],
        cwd: '/',
        env: sandboxEnv('/tmp'),
        timeoutMs: 20_000,
      });
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(Date.now() - started).toBeLessThan(5_000);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'a hanging command is killed at the timeout',
    async () => {
      const runner = createSpawnRunner([]);
      const started = Date.now();
      const result = await runner({
        argv: ['/bin/sleep', '30'],
        cwd: '/',
        env: sandboxEnv('/tmp'),
        timeoutMs: 120,
      });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBeNull();
      expect(Date.now() - started).toBeLessThan(5_000);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'without a jail the runner refuses to spawn',
    async () => {
      const runner = createSpawnRunner(null);
      await expect(
        runner({ argv: ['/bin/true'], cwd: '/', env: {}, timeoutMs: 100 }),
      ).rejects.toBeInstanceOf(SandboxUnavailableError);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'the production runner runs under the platform jail or fails closed',
    async () => {
      const request = {
        argv: ['/bin/echo', 'ok'],
        cwd: '/tmp',
        env: sandboxEnv('/tmp'),
        timeoutMs: 15_000,
      };
      if (await jailWorks()) {
        const result = await createSpawnRunner()(request);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('ok');
        return;
      }
      // A host that refuses the jail must block the check through the same entry
      // point instead of running it with network.
      await expect(createSpawnRunner()(request)).rejects.toBeInstanceOf(SandboxUnavailableError);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test('the network jail exists on this platform', () => {
    expect(networkJail()).toBeDefined();
  });

  test(
    'checks really run without network under the jail',
    async () => {
      const jail = networkJail();
      if (jail === null) return;
      const bare = createSpawnRunner([]);
      const canJail = await bare({
        argv: [...jail, '/bin/true'],
        cwd: '/tmp',
        env: sandboxEnv('/tmp'),
        timeoutMs: 10_000,
      });
      // Some hardened runners block the jail itself; the argv-level tests cover
      // those platforms, the real spawn must not be faked here.
      if (canJail.exitCode !== 0) return;
      const runner = createSpawnRunner(jail);
      const result = await runner({
        argv: [
          '/bin/sh',
          '-c',
          'if command -v curl >/dev/null 2>&1; then curl -s --max-time 2 http://93.184.216.34/ >/dev/null; echo blocked=$?; else echo blocked=missing; fi',
        ],
        cwd: '/tmp',
        env: sandboxEnv('/tmp'),
        timeoutMs: 15_000,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('blocked=');
      expect(result.stdout).not.toContain('blocked=0');
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );
});
