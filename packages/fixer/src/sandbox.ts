import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { FixerFault } from './faults';

export interface SandboxRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly root: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly noNetwork: true;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly timedOut: boolean;
}

export type SandboxRunner = (request: SandboxRequest) => Promise<CommandResult>;

export function sandboxEnv(root: string): Record<string, string> {
  return {
    PATH: `/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${dirname(process.execPath)}`,
    HOME: join(root, 'home'),
    TMPDIR: join(root, 'tmp'),
    LANG: 'C.UTF-8',
    CI: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'protocol.allow',
    GIT_CONFIG_VALUE_2: 'never',
  };
}

function execute(argv: readonly string[], request: SandboxRequest): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const program = argv[0];
    if (program === undefined) return reject(new FixerFault('CHECK_FAILED', 'empty check command'));
    const child = spawn(program, argv.slice(1), {
      cwd: request.cwd,
      env: request.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let timedOut = false;
    function stop() {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* The process group has exited. */
        }
      }
    }
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, request.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) stop();
      else chunks.push(chunk);
    });
    child.once('error', () => {
      clearTimeout(timer);
      stop();
      reject(new FixerFault('SANDBOX_UNAVAILABLE', 'sandbox process could not start'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      stop();
      resolve({
        exitCode: bytes > 2 * 1024 * 1024 ? 1 : (code ?? 1),
        stdout: Buffer.concat(chunks).toString('utf8'),
        timedOut,
      });
    });
  });
}

function macProfile(root: string): string {
  const tools = [
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/Cellar',
    '/opt/homebrew/opt',
    '/Library/Developer',
    root,
  ];
  const reads = [
    '/System',
    '/usr',
    '/bin',
    '/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/Cellar',
    '/opt/homebrew/lib',
    '/opt/homebrew/opt',
    '/Library/Developer',
    '/dev',
    root,
  ];
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    // Apple's application.sb and sanitizer-support.sb restrict child access with same-sandbox.
    '(deny signal)',
    '(allow signal (target self) (target same-sandbox))',
    '(deny process-info*)',
    '(allow process-info* (target self) (target same-sandbox))',
    '(deny mach-task-name)',
    '(allow mach-task-name (target self) (target same-sandbox))',
    '(deny process-exec)',
    `(allow process-exec (literal ${JSON.stringify(process.execPath)}) ${tools.map((path) => `(subpath ${JSON.stringify(path)})`).join(' ')})`,
    '(allow process-fork)',
    '(deny mach-lookup)',
    '(deny appleevent-send)',
    '(deny file-read*)',
    '(allow file-read-metadata)',
    `(allow file-read* (literal "/") (literal ${JSON.stringify(process.execPath)}) ${reads.map((path) => `(subpath ${JSON.stringify(path)})`).join(' ')})`,
    '(deny file-write*)',
    `(allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null"))`,
  ].join('\n');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isolation(request: SandboxRequest): Promise<string[]> {
  if (process.platform === 'darwin' && (await exists('/usr/bin/sandbox-exec'))) {
    return ['/usr/bin/sandbox-exec', '-p', macProfile(request.root)];
  }
  if (process.platform === 'linux') {
    const available = await Promise.all(
      ['/usr/bin/bwrap', '/bin/bwrap'].map(async (path) =>
        (await exists(path)) ? path : undefined,
      ),
    );
    const executable = available.find((path) => path !== undefined);
    if (executable) {
      const args = [
        executable,
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--cap-drop',
        'ALL',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
      ];
      const paths = await Promise.all(
        ['/usr', '/bin', '/sbin', '/lib', '/lib64'].map(async (path) =>
          (await exists(path)) ? path : undefined,
        ),
      );
      for (const path of paths) if (path !== undefined) args.push('--ro-bind', path, path);
      if (!process.execPath.startsWith('/usr/') && !process.execPath.startsWith('/bin/')) {
        args.push('--ro-bind', process.execPath, process.execPath);
      }
      args.push('--bind', request.root, request.root, '--chdir', request.cwd, '--');
      return args;
    }
    // A network namespace alone cannot isolate host files. Require bubblewrap as well.
    if (await exists('/usr/bin/unshare')) {
      throw new FixerFault(
        'SANDBOX_UNAVAILABLE',
        'network namespaces are available but filesystem isolation needs bubblewrap',
      );
    }
  }
  throw new FixerFault('SANDBOX_UNAVAILABLE', 'network and filesystem isolation are unavailable');
}

export const runSandboxed: SandboxRunner = async (request) => {
  const deadline = performance.now() + request.timeoutMs;
  const prefix = await isolation(request);
  const probe = await execute([...prefix, '/usr/bin/true'], {
    ...request,
    timeoutMs: Math.min(2000, request.timeoutMs),
  });
  if (probe.exitCode !== 0 || probe.timedOut) {
    throw new FixerFault('SANDBOX_UNAVAILABLE', 'sandbox isolation probe failed');
  }
  const remaining = Math.floor(deadline - performance.now());
  if (remaining <= 0) return { exitCode: 1, stdout: '', timedOut: true };
  return execute([...prefix, ...request.argv], { ...request, timeoutMs: remaining });
};
