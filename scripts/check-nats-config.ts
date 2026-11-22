import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local-only check. `nats-server -t` parses the config and exits; no daemon
// starts. CI does not run this script. Run it after editing nats.conf.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'deploy', 'compose', 'nats', 'nats.conf');

async function readOutput(
  output: number | ReadableStream<Uint8Array> | undefined,
): Promise<string> {
  if (typeof output !== 'object' || output === null) return '';
  return await new Response(output).text();
}

async function check(): Promise<void> {
  const raw = await Bun.file(configPath).text();
  const scratch = mkdtempSync(join(tmpdir(), 'graveshift-nats-check-'));
  try {
    // nats-server -t resolves TLS paths. Use a throwaway certificate so the
    // real secret mount is not needed and no credential is written to disk.
    const cert = join(scratch, 'cert.pem');
    const key = join(scratch, 'key.pem');
    const ca = join(scratch, 'ca.pem');
    const makeCert = Bun.spawn(
      [
        'openssl',
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
      ],
      { stdout: 'ignore', stderr: 'pipe' },
    );
    if ((await makeCert.exited) !== 0) {
      const detail = await readOutput(makeCert.stderr);
      throw new Error(`Could not create a throwaway certificate: ${detail.trim()}`);
    }
    writeFileSync(ca, await Bun.file(cert).text());

    const rendered = raw
      .replaceAll('/run/secrets/nats/tls.crt', cert)
      .replaceAll('/run/secrets/nats/tls.key', key)
      .replaceAll('/run/secrets/nats/ca.crt', ca);
    const tempConfig = join(scratch, 'nats.conf');
    await Bun.write(tempConfig, rendered);

    let server: ReturnType<typeof Bun.spawn>;
    try {
      server = Bun.spawn(['nats-server', '-t', '-c', tempConfig], {
        env: {
          ...process.env,
          NATS_PUBLISH_USER: 'check-publisher',
          NATS_PUBLISH_PASSWORD: 'check-password',
          NATS_READ_USER: 'check-reader',
          NATS_READ_PASSWORD: 'check-password',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
    } catch {
      throw new Error('nats-server is not on PATH. Install it with: brew install nats-server');
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      readOutput(server.stdout),
      readOutput(server.stderr),
      server.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `nats-server -t failed (exit ${exitCode}): ${stderr.trim()} ${stdout.trim()}`,
      );
    }
    const detail = stdout.trim() || stderr.trim() || 'nats-server config is valid';
    process.stdout.write(`${detail}\nChecked ${configPath}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  await check();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
