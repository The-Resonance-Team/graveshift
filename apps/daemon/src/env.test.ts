import { createGateway } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';

import { createCollectors } from './collectors';
import { readDaemonConfig } from './config';
import { executorFromEnv } from './fix-execution';

describe('daemon example environment values', () => {
  test('empty optional Collector settings leave every integration disabled', async () => {
    const collectors = createCollectors({
      GRAVESHIFT_DOCKER_URL: '',
      GRAVESHIFT_PROMETHEUS_URL: '',
      GRAVESHIFT_K8S_ENABLED: '',
      GRAVESHIFT_K8S_NAMESPACES: '',
      GRAVESHIFT_METRIC_TARGETS: '',
      GRAVESHIFT_COLLECTOR_SERVICE: '',
    });
    let published = 0;
    await collectors.start('project-1', {
      publish: async () => {
        published++;
      },
    });
    await collectors.stop();
    expect(collectors.integrations).toEqual([]);
    expect(collectors.reads).toEqual([]);
    expect(collectors.metrics).toBeUndefined();
    expect(collectors.metricJobs).toEqual([]);
    expect(published).toBe(0);
  });

  test('empty optional transport settings use intentional local defaults', () => {
    const config = readDaemonConfig({
      GRAVESHIFT_API_INTERNAL_TOKEN: 'local-api-test-token-with-at-least-32-chars',
      GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'local-daemon-test-token-with-at-least-32-chars',
      GRAVESHIFT_API_URL: '',
      GRAVESHIFT_DAEMON_URL: '',
      GRAVESHIFT_NATS_URL: '',
      GRAVESHIFT_COMMAND_TIMEOUT_MS: '',
      GRAVESHIFT_API_TIMEOUT_MS: '',
      GRAVESHIFT_BODY_MAX_BYTES: '',
    });
    expect(config.GRAVESHIFT_API_URL).toBe('http://127.0.0.1:3000');
    expect(config.GRAVESHIFT_DAEMON_URL).toBe('http://127.0.0.1:2602');
    expect(config.GRAVESHIFT_NATS_URL).toBe('nats://127.0.0.1:4222');
    expect(config.GRAVESHIFT_COMMAND_TIMEOUT_MS).toBe(180_000);
    expect(config.GRAVESHIFT_API_TIMEOUT_MS).toBe(10_000);
    expect(config.GRAVESHIFT_BODY_MAX_BYTES).toBe(65_536);
  });

  test('an empty optional dashboard URL leaves the real fix adapter configured without I/O', () => {
    const gateway = createGateway({
      agents: [],
      config: { globalDailyBudgetUsd: 1, maxRetries: 0, timeoutMs: 1000, priceTableUsdPer1M: {} },
      onAudit: async (event) => ({ callId: event.callId }),
    });
    const env = {
      GRAVESHIFT_GITHUB_APP_ID: '1',
      GRAVESHIFT_GITHUB_PRIVATE_KEY_PEM: 'test-private-key',
      GRAVESHIFT_GITHUB_INSTALLATIONS: '{"team/grave":1}',
      GRAVESHIFT_VERIFY_COMMANDS: '{"team/grave":[["git","diff","--check"]]}',
      GRAVESHIFT_VERIFY_TIMEOUT_MS: '',
      GRAVESHIFT_DASHBOARD_URL: '',
    };
    const executor = executorFromEnv(gateway, env);
    expect(typeof executor.execute).toBe('function');
    expect(typeof executor.recover).toBe('function');
    expect(() => executorFromEnv(gateway, { ...env, GRAVESHIFT_GITHUB_APP_ID: '' })).toThrow(
      'configuration is invalid',
    );
    expect(() =>
      executorFromEnv(gateway, { ...env, GRAVESHIFT_GITHUB_PRIVATE_KEY_PEM: '' }),
    ).toThrow('configuration is invalid');
    expect(() =>
      readDaemonConfig({
        GRAVESHIFT_API_INTERNAL_TOKEN: '',
        GRAVESHIFT_DAEMON_INTERNAL_TOKEN: '',
      }),
    ).toThrow('configuration is invalid');
  });
});
