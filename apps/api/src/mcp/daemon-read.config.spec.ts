import { describe, expect, test } from 'bun:test';

import { buildDaemonReadConfig } from './daemon-read.config';

describe('daemon read config', () => {
  test('there is no default token and boot fails closed when it is missing', () => {
    expect(() => buildDaemonReadConfig({})).toThrow('GRAVESHIFT_DAEMON_READ_TOKEN');
    expect(() => buildDaemonReadConfig({ GRAVESHIFT_DAEMON_READ_TOKEN: '' })).toThrow(
      'GRAVESHIFT_DAEMON_READ_TOKEN',
    );
  });

  test('the base address and token are injected as options', () => {
    expect(
      buildDaemonReadConfig({
        GRAVESHIFT_DAEMON_READ_URL: 'http://127.0.0.1:2602',
        GRAVESHIFT_DAEMON_READ_TOKEN: 'test-only-read-token',
      }),
    ).toEqual({
      baseUrl: 'http://127.0.0.1:2602',
      token: 'test-only-read-token',
    });
  });

  test('the default base address stays on loopback', () => {
    expect(
      buildDaemonReadConfig({ GRAVESHIFT_DAEMON_READ_TOKEN: 'test-only-read-token' }).baseUrl,
    ).toBe('http://127.0.0.1:2602');
  });
});
