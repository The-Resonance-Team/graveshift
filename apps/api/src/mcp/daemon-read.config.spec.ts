import { describe, expect, test } from 'bun:test';

import { buildDaemonReadConfig } from './daemon-read.config';

describe('daemon read config', () => {
  test('the ADR 0020 daemon internal token has no default and boot fails closed', () => {
    expect(() => buildDaemonReadConfig({})).toThrow('GRAVESHIFT_DAEMON_INTERNAL_TOKEN');
    expect(() => buildDaemonReadConfig({ GRAVESHIFT_DAEMON_INTERNAL_TOKEN: '' })).toThrow(
      'GRAVESHIFT_DAEMON_INTERNAL_TOKEN',
    );
  });

  test('the base address and the internal token are injected as client options', () => {
    expect(
      buildDaemonReadConfig({
        GRAVESHIFT_DAEMON_READ_URL: 'http://127.0.0.1:2602',
        GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'graveshift-test-daemon-internal-32chars',
      }),
    ).toEqual({
      baseUrl: 'http://127.0.0.1:2602',
      token: 'graveshift-test-daemon-internal-32chars',
    });
  });

  test('the default base address stays on loopback', () => {
    expect(
      buildDaemonReadConfig({
        GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'graveshift-test-daemon-internal-32chars',
      }).baseUrl,
    ).toBe('http://127.0.0.1:2602');
  });
});
