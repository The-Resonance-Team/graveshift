import { mkdirSync, existsSync, rmSync } from 'node:fs';

Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
const { runSandboxed } = await import('/target/packages/fixer/src/sandbox.ts');

const root = '/scratch/work';
mkdirSync(root, { recursive: true });
const marker = `${root}/descendant-survived`;
try { rmSync(marker, { force: true }); } catch {}

const childCode = `
  const fs = require('node:fs');
  setTimeout(() => { try { fs.writeFileSync('${marker}', 'alive'); } catch {} }, 200);
  setInterval(() => {}, 1000);
`;
const foregroundCode = `
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { detached: true, stdio: 'ignore' });
  child.unref();
  process.stdout.write('foreground-done');
`;

const started = Date.now();
let result: any;
let error: string | undefined;
try {
  result = await runSandboxed({
    argv: [process.execPath, '-e', foregroundCode],
    cwd: root,
    root,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/scratch', TMPDIR: '/scratch' },
    timeoutMs: 1500,
    noNetwork: true,
  });
} catch (cause) {
  error = String(cause);
}
const elapsedMs = Date.now() - started;
await new Promise(resolve => setTimeout(resolve, 500));
const survivorMarker = existsSync(marker);

console.log(JSON.stringify({
  lead: 'fixer/sandbox/macos-detached-descendant-lifetime',
  verdict: survivorMarker ? 'confirmed' : (error ? 'inconclusive' : 'rejected'),
  observed: {
    platformSeenBySandbox: process.platform,
    elapsedMs,
    result,
    error,
    foregroundExitedBeforeDeadline: elapsedMs < 1500,
    descendantWroteMarkerAfterSupervisorReturn: survivorMarker,
    note: 'process.platform was patched to darwin and a shim execs sandbox-exec arguments unchanged; no real macOS sandbox policy is claimed. This tests only the supervisor teardown logic in execute().',
  },
  reason: survivorMarker
    ? 'A detached descendant kept running and wrote inside the workspace after runSandboxed returned, showing cleanup targeted only the original process group.'
    : error
      ? `Harness could not complete: ${error}`
      : 'No descendant marker appeared after return in this fixture; supervisor cleanup held for this case.',
}, null, 2));
