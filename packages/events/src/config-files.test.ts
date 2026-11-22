import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { DETECTION_CONSUMER, GRAVESHIFT_EVENTS_STREAM } from './streams';

const here = dirname(fileURLToPath(import.meta.url));
const natsDir = join(here, '../../../deploy/compose/nats');
const conf = await Bun.file(join(natsDir, 'nats.conf')).text();
const compose = await Bun.file(join(here, '../../../deploy/compose/graveshift.compose.yml')).text();
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
    const jetstream = conf.match(/jetstream \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(conf).toContain('jetstream');
    expect(jetstream).toContain('store_dir: "/data/jetstream"');
  });

  test('sets max_payload at the top level, outside the jetstream block', () => {
    const jetstream = conf.match(/jetstream \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(jetstream).not.toContain('max_payload');
    expect(conf).toMatch(/^max_payload:\s*131072\s*$/m);
  });

  test('enables TLS and a private bind', () => {
    expect(conf).toMatch(/tls\s*\{/);
    expect(conf).toMatch(/cert_file:/);
    expect(conf).toMatch(/key_file:/);
    expect(conf).toMatch(/listen:\s*0\.0\.0\.0:4222/);
    expect(conf).toMatch(/http:\s*127\.0\.0\.1:8222/);
  });

  test('explains the container bind and publishes no NATS host port', () => {
    const nats = compose.match(/^  nats:\n([\s\S]*?)(?=^networks:)/m)?.[1] ?? '';
    expect(nats).not.toBe('');
    expect(nats).toContain("expose: ['4222']");
    expect(nats).not.toMatch(/^\s{4}ports:/m);
    expect(conf).toContain('# The container must bind 0.0.0.0');
  });

  test('defines separate publish and read users', () => {
    expect(conf).toContain('$NATS_PUBLISH_USER');
    expect(conf).toContain('$NATS_READ_USER');
    const publisher = conf.match(/user: \$NATS_PUBLISH_USER([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(publisher).toContain('publish: ["graveshift.>"]');
  });

  test('gives the read user only the request, pull and ack publish subjects', () => {
    const readUser = conf.match(/user: \$NATS_READ_USER([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(readUser).not.toBe('');
    const publish = (readUser.match(/publish: \[([\s\S]*?)\]/)?.[1] ?? '').replace(/\s/g, '');
    const subscribe = (readUser.match(/subscribe: \[([\s\S]*?)\]/)?.[1] ?? '').replace(/\s/g, '');

    for (const subject of [
      '$JS.API.STREAM.INFO.GRAVESHIFT_EVENTS',
      '$JS.API.DIRECT.GET.GRAVESHIFT_EVENTS.>',
      '$JS.API.CONSUMER.MSG.NEXT.GRAVESHIFT_EVENTS.graveshift-watcher',
      '$JS.ACK.GRAVESHIFT_EVENTS.>',
    ]) {
      expect(publish).toContain(`"${subject}"`);
    }
    expect(subscribe).toBe('"_INBOX.>"');
    expect(publish).not.toContain('$JS.API.*');
    expect(publish).not.toContain('graveshift.>');
  });

  test('opens no MQTT, leafnode or WebSocket listener', () => {
    expect(conf).not.toMatch(/^\s*mqtt\s*\{/m);
    expect(conf).not.toMatch(/^\s*leafnodes\s*\{/m);
    expect(conf).not.toMatch(/^\s*websocket\s*\{/m);
    expect(conf).not.toContain('port: -1');
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
