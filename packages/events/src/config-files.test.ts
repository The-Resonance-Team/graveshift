import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { DETECTION_CONSUMER, GRAVESHIFT_EVENTS_STREAM } from './streams';

const here = dirname(fileURLToPath(import.meta.url));
const natsDir = join(here, '../../../deploy/compose/nats');
const conf = await Bun.file(join(natsDir, 'nats.conf')).text();
const runbook = await Bun.file(
  join(here, '../../../docs/runbooks/nats-jetstream-backup.md'),
).text();

describe('declarative NATS config matches the code', () => {
  test('stream config matches the one stream definition', async () => {
    const file = join(natsDir, 'graveshift-events.stream.json');
    const config = await Bun.file(file).json();
    expect(config).toEqual(GRAVESHIFT_EVENTS_STREAM);
  });

  test('consumer config matches the one detection consumer definition', async () => {
    const file = join(natsDir, 'graveshift-watcher.consumer.json');
    const config = await Bun.file(file).json();
    expect(config).toEqual(DETECTION_CONSUMER);
  });
});

describe('NATS server config', () => {
  test('uses JetStream with file storage', () => {
    expect(conf).toContain('jetstream');
  });

  test('uses file storage with a 128 KiB payload limit', () => {
    expect(conf).toMatch(/store_dir:\s*"\/data\/jetstream"/);
    expect(conf).toMatch(/max_payload:\s*131072/);
  });

  test('enables TLS and a private bind', () => {
    expect(conf).toMatch(/tls\s*\{/);
    expect(conf).toMatch(/cert_file:/);
    expect(conf).toMatch(/key_file:/);
    expect(conf).toMatch(/listen:\s*0\.0\.0\.0:4222/);
    expect(conf).toMatch(/http:\s*127\.0\.0\.1:8222/);
  });

  test('defines separate publish and read users', () => {
    expect(conf).toContain('$NATS_PUBLISH_USER');
    expect(conf).toContain('$NATS_READ_USER');
    expect(conf).toContain('graveshift.>');
    expect(conf).toContain('$JS.API');
  });

  test('disables MQTT, leafnode and WebSocket ports', () => {
    expect(conf).toMatch(/mqtt\s*\{[\s\S]*?port:\s*-1/);
    expect(conf).toMatch(/leafnodes\s*\{[\s\S]*?port:\s*-1/);
    expect(conf).toMatch(/websocket\s*\{[\s\S]*?port:\s*-1/);
  });
});

describe('backup and restore runbook', () => {
  test('names the stream and the snapshot, validate, info and restore commands', () => {
    expect(runbook).toContain('GRAVESHIFT_EVENTS');
    expect(runbook).toContain('nats backup stream GRAVESHIFT_EVENTS');
    expect(runbook).toContain('--consumers');
    expect(runbook).toContain('nats backup validate');
    expect(runbook).toContain('nats backup info');
    expect(runbook).toContain('nats backup restore stream');
    expect(runbook).toContain('nats stream info GRAVESHIFT_EVENTS');
  });

  test('requires an encrypted off-site copy and keeps credentials out of the backup', () => {
    expect(runbook.toLowerCase()).toContain('encrypt');
    expect(runbook).toContain('secret store');
    expect(runbook).toContain('credential');
  });
});
