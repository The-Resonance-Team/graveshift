// The bounded pipe read and the kill policy, driven through the runner's process
// seam: no real subprocess is needed to prove what happens to a pipe that never
// closes or to a command that already exited.
import { describe, expect, test } from 'bun:test';

import { after, readCapped } from './pipes';
import { createSpawnRunner, SANDBOX_OUTPUT_CAP, type SpawnedChild } from './spawn';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const closedStream = (...chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(text(chunk));
      controller.close();
    },
  });

/**
 * A pipe whose other end never closes: what a grandchild that outlived the direct
 * child leaves behind. It records every read it is asked for and every cancel.
 */
function heldStream(chunk = 'kept output\n') {
  let pulls = 0;
  let cancels = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      pulls += 1;
      await wait(50);
      controller.enqueue(text(chunk));
    },
    cancel() {
      cancels += 1;
    },
  });
  return { stream, pulls: () => pulls, cancels: () => cancels };
}

/** The child the runner sees, started through the injected process seam. */
function fakeChild(over: Partial<SpawnedChild> & { pid?: number } = {}): SpawnedChild {
  return {
    pid: over.pid ?? 4242,
    // Null until the process is gone: that is what tells the runner a signal is allowed.
    exitCode: over.exitCode ?? null,
    exited: over.exited ?? Promise.resolve(0),
    stdout: over.stdout === undefined ? closedStream() : over.stdout,
    stderr: over.stderr === undefined ? null : over.stderr,
  };
}

/** A child whose exit is reported by the caller, as the real one reports it. */
function pendingChild(over: Partial<SpawnedChild> & { pid?: number } = {}) {
  let report!: (code: number) => void;
  const exited = new Promise<number>((resolve) => {
    report = resolve;
  });
  const child = {
    pid: over.pid ?? 4242,
    exitCode: null as number | null,
    exited,
    stdout: over.stdout === undefined ? closedStream() : over.stdout,
    stderr: over.stderr === undefined ? null : over.stderr,
  };
  return {
    child,
    // The process is gone but the runner has not seen `exited` yet.
    markGone: (code: number) => {
      child.exitCode = code;
    },
    // The runner is released when it learns the process exited.
    report,
  };
}

/** Replace the real signal path for one call and report what was signalled. */
async function withSignalSpy<T>(
  run: (signals: () => string[]) => Promise<T>,
  onSignal: (target: number) => void = () => undefined,
): Promise<T> {
  const seen: string[] = [];
  const real = process.kill;
  process.kill = ((target: number, signal?: string) => {
    seen.push(`${target}:${signal ?? 'SIGTERM'}`);
    onSignal(target);
    return true;
  }) as typeof process.kill;
  try {
    return await run(() => [...seen]);
  } finally {
    process.kill = real;
  }
}

const request = (timeoutMs = 20_000) => ({ argv: ['/bin/true'], cwd: '/', env: {}, timeoutMs });

describe('readCapped', () => {
  test('keeps the first bytes and drains the rest without storing them', async () => {
    const chunk = 'x'.repeat(1024);
    const read = readCapped(closedStream(...Array.from({ length: 200 }, () => chunk)), 4096);
    await read.done;
    expect(read.result.text).toHaveLength(4096);
    expect(read.result.truncated).toBe(true);
  });

  test('a short pipe is returned whole and unmarked', async () => {
    const read = readCapped(closedStream('a', 'b', 'c'), SANDBOX_OUTPUT_CAP);
    await read.done;
    expect(read.result.text).toBe('abc');
    expect(read.result.truncated).toBe(false);
  });

  test('a missing pipe is an empty read', async () => {
    const read = readCapped(null, SANDBOX_OUTPUT_CAP);
    await read.done;
    expect(read.result.text).toBe('');
    read.cancel();
    expect(read.result.truncated).toBe(false);
  });

  test('cancel stops the pump and keeps what was already read', async () => {
    const held = heldStream('partial\n');
    const read = readCapped(held.stream, SANDBOX_OUTPUT_CAP);
    await wait(120);
    read.cancel();
    await read.done;
    expect(read.result.text).toContain('partial');
    expect(read.result.truncated).toBe(true);
    expect(held.cancels()).toBe(1);
    const pullsAtCancel = held.pulls();
    await wait(200);
    expect(held.pulls()).toBe(pullsAtCancel);
  });

  test('the bounded wait resolves only by expiry', async () => {
    // A pipe that finishes first wins the race; the wait itself never resolves
    // with anything but 'expired'.
    expect(await Promise.race([Promise.resolve('won'), after(200)])).toBe('won');
    expect(await after(10)).toBe('expired');
  });
});

describe('the runner over a child that needs no real process', () => {
  test('the pipe readers are cancelled when the bounded drain expires', async () => {
    const held = heldStream();
    const runner = createSpawnRunner([], { spawn: () => fakeChild({ stdout: held.stream }) });
    const started = Date.now();
    // The child exited and nothing more will arrive, so the only way back is the
    // bounded drain plus a cancel: the stream itself never ends.
    const result = await runner(request());
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kept output');
    expect(result.stdoutTruncated).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(held.cancels()).toBe(1);
    // No read is started after the cancel: the pump stopped for good.
    const pullsAtCancel = held.pulls();
    expect(pullsAtCancel).toBeGreaterThan(0);
    await wait(250);
    expect(held.pulls()).toBe(pullsAtCancel);
  }, 30_000);

  test('both pipes are cancelled when only stderr is held open', async () => {
    const held = heldStream('late stderr\n');
    const runner = createSpawnRunner([], {
      spawn: () => fakeChild({ stdout: null, stderr: held.stream }),
    });
    const result = await runner(request());
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('late stderr');
    expect(result.stderrTruncated).toBe(true);
    expect(result.stdout).toBe('');
    expect(result.stdoutTruncated).toBe(false);
    expect(held.cancels()).toBe(1);
  }, 30_000);

  test('a check that exited on its own is never signalled', async () => {
    await withSignalSpy(async (signals) => {
      const runner = createSpawnRunner([], { spawn: () => fakeChild() });
      const result = await runner(request(10_000));
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      // The child is reaped, so its pid may be reused: no signal goes there.
      expect(signals()).toEqual([]);
    });
  }, 30_000);

  test('a timeout that fires on a process that already exited signals nothing', async () => {
    const gone = pendingChild({ pid: 4242 });
    // The process is gone before the timeout is reached and the runner has not seen
    // it yet: the timer must refuse the signal instead of trusting the pid.
    gone.markGone(0);
    setTimeout(() => gone.report(0), 60);
    await withSignalSpy(async (signals) => {
      const runner = createSpawnRunner([], { spawn: () => gone.child });
      const result = await runner(request(10));
      expect(signals()).toEqual([]);
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    });
  }, 30_000);

  test('a check that outlives its timeout is killed while it is still running', async () => {
    let settle!: (code: number) => void;
    const exited = new Promise<number>((resolve) => {
      settle = resolve;
    });
    await withSignalSpy(
      async (signals) => {
        const runner = createSpawnRunner([], {
          spawn: () => fakeChild({ pid: 4242, exited, stdout: closedStream(), stderr: null }),
        });
        const result = await runner(request(120));
        expect(result.timedOut).toBe(true);
        expect(result.exitCode).toBeNull();
        // The group first, then the process: both while the command is ours.
        expect(signals()).toEqual(['-4242:SIGKILL', '4242:SIGKILL']);
      },
      // The command is gone once it is signalled, so the fake exits there.
      () => settle(137),
    );
  }, 30_000);
});
