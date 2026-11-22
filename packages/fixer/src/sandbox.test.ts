import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { FixerFault } from './faults';
import { runSandboxed, sandboxEnv } from './sandbox';

test('the platform adapter blocks network, host reads and writes, and inherited secrets', async () => {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(await realpath(parent), 'fixer-sandbox-'));
  const outside = await mkdtemp(join(await realpath(parent), 'fixer-outside-'));
  const marker = join(outside, 'credential.txt');
  await writeFile(marker, 'host-private-value');
  await Promise.all(['home', 'tmp'].map((name) => mkdir(join(root, name))));
  let networkCalls = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => {
      networkCalls++;
      return new Response('network allowed');
    },
  });
  const script = [
    `import {readFile,writeFile} from 'node:fs/promises';`,
    `if(Object.keys(process.env).some(key=>/TOKEN|SECRET|API_KEY|SSH|AUTH/i.test(key))) process.exit(11);`,
    `let denied=0;`,
    `try {await readFile(${JSON.stringify(marker)});} catch {denied++;}`,
    `try {await writeFile(${JSON.stringify(marker)},'changed');} catch {denied++;}`,
    `try {await fetch('http://127.0.0.1:${server.port}', {signal:AbortSignal.timeout(500)});} catch {denied++;}`,
    `if(denied!==3)process.exit(12);`,
    `await writeFile('inside.txt','allowed');`,
  ].join('\n');
  try {
    try {
      const result = await runSandboxed({
        argv: [process.execPath, '-e', script],
        root,
        cwd: root,
        env: sandboxEnv(root),
        timeoutMs: 3000,
        noNetwork: true,
      });
      expect(result).toMatchObject({ exitCode: 0, timedOut: false });
      expect(await readFile(join(root, 'inside.txt'), 'utf8')).toBe('allowed');
    } catch (error) {
      // Hosts without an enforceable sandbox must reject, before executing the check.
      if (!(error instanceof FixerFault) || error.code !== 'SANDBOX_UNAVAILABLE') throw error;
      if (process.platform === 'darwin') throw error;
      expect(error.code).toBe('SANDBOX_UNAVAILABLE');
      await expect(access(join(root, 'inside.txt'))).rejects.toThrow();
    }
    expect(networkCalls).toBe(0);
    expect(await readFile(marker, 'utf8')).toBe('host-private-value');
  } finally {
    await server.stop(true);
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});

test('the platform adapter bounds a running check with a hard timeout', async () => {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(await realpath(parent), 'fixer-timeout-'));
  try {
    try {
      const result = await runSandboxed({
        argv: ['/bin/sleep', '10'],
        root,
        cwd: root,
        env: sandboxEnv(root),
        timeoutMs: 50,
        noNetwork: true,
      });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).not.toBe(0);
    } catch (error) {
      if (!(error instanceof FixerFault)) throw error;
      if (process.platform === 'darwin') throw error;
      expect(error.code).toBe('SANDBOX_UNAVAILABLE');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
