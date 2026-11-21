import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import {
  parseSentryEnvelope,
  SentryEnvelopeParseError,
  SentryEnvelopeTooLargeError,
} from './sentry-envelope.parser';

const fixture = new URL('../../test/fixtures/sentry-event.envelope', import.meta.url);

describe('parseSentryEnvelope', () => {
  test('reads a Sentry event and skips other framed items', async () => {
    const body = await readFile(fixture);
    const envelope = parseSentryEnvelope(body);

    expect(envelope.header.event_id).toBe('0123456789abcdef0123456789abcdef');
    expect(envelope.items.map((item) => item.type)).toEqual([
      'client_report',
      'attachment',
      'event',
    ]);
    expect(envelope.items[0]).toEqual({ type: 'client_report' });
    expect(envelope.items[1]).toEqual({ type: 'attachment' });
    expect(envelope.items[2]?.payload).toMatchObject({ level: 'warning' });
  });

  test('reads length-prefixed UTF-8 payloads by byte length', () => {
    const event = Buffer.from(JSON.stringify({ event_id: 'é', timestamp: 1 }));
    const body = Buffer.concat([
      Buffer.from('{}\n{"type":"event","length":' + event.length + '}\n'),
      event,
      Buffer.from('\n'),
    ]);

    expect(parseSentryEnvelope(body).items[0]?.payload).toEqual({ event_id: 'é', timestamp: 1 });
  });

  test('rejects malformed event JSON and incomplete item payloads', () => {
    expect(() => parseSentryEnvelope(Buffer.from('{}\n{"type":"event"}\nnot json'))).toThrow(
      SentryEnvelopeParseError,
    );
    expect(() => parseSentryEnvelope(Buffer.from('{}\n{"type":"event","length":20}\n{}'))).toThrow(
      SentryEnvelopeParseError,
    );
  });

  test('rejects CRLF headers and padded JSON headers', () => {
    expect(() => parseSentryEnvelope(Buffer.from('{}\r\n'))).toThrow(SentryEnvelopeParseError);
    expect(() => parseSentryEnvelope(Buffer.from(' {}\n'))).toThrow(SentryEnvelopeParseError);
  });

  test('bounds the complete envelope', () => {
    expect(() => parseSentryEnvelope(Buffer.alloc(1_048_577))).toThrow(SentryEnvelopeTooLargeError);
  });
});
