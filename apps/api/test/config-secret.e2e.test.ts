import type { ConfigExportResponse } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import {
  CLIENTS,
  CONFIG_EXPORT_ROUTE,
  FAKE_CONFIG,
  INVALID_BOOT_CONFIG_PATH,
  UNKNOWN_SECRET_KEY,
  UNKNOWN_SECRET_VALUE,
  appFromConfigFile,
  bearerToken,
  bootFailureFromConfigFile,
  restoreEnv,
  validated,
  wire,
  withTempConfigFile,
} from './config-test-helpers';
import { setupAuthDatabase } from './database/auth.fixture';
import { dbTestEnabled } from './database/fixtures';

describe.skipIf(!dbTestEnabled)('config secret hygiene (e2e)', () => {
  const fixture = setupAuthDatabase();
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    restoreEnv();
  });

  test('an unknown key with a secret in the Agent block stops boot and never reaches a response', async () => {
    const source = await Bun.file(FAKE_CONFIG).text();
    // One extra key inside the first Agent. AgentConfigSchema is strict, so boot fails.
    const text = source.replace(
      '      apiKeyEnv: GRAVESHIFT_TEST_AGENT_API_KEY',
      `      apiKeyEnv: GRAVESHIFT_TEST_AGENT_API_KEY\n      ${UNKNOWN_SECRET_KEY}: ${UNKNOWN_SECRET_VALUE}`,
    );
    expect(text).not.toBe(source);
    await withTempConfigFile('config.unknown-agent-key.yaml', text, async (path) => {
      const failure = await bootFailureFromConfigFile(path);
      expect(failure).toBeInstanceOf(Error);
      const message = (failure as Error).message;
      expect(message).toMatch(/Unrecognized key|strict/);
      expect(message).toContain(UNKNOWN_SECRET_KEY);
      // The rejected value stays out of the boot error, and no app exists to serve it.
      expect(message).not.toContain(UNKNOWN_SECRET_VALUE);
      expect(message).not.toContain('sk-fake');
    });
  });

  test('an unknown key with a secret in the policy block is stripped at boot and never returned', async () => {
    const source = await Bun.file(FAKE_CONFIG).text();
    // One extra key inside the policy block. PolicySchema strips unknown keys at boot.
    const text = source.replace(
      'policy:\n',
      `policy:\n  ${UNKNOWN_SECRET_KEY}: ${UNKNOWN_SECRET_VALUE}\n`,
    );
    expect(text).not.toBe(source);
    await withTempConfigFile('config.unknown-policy-key.yaml', text, async (path) => {
      const built = await appFromConfigFile(fixture, path);
      app = built.app;
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const response = await request(built.app.getHttpServer())
        .get(CONFIG_EXPORT_ROUTE)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.text).not.toContain(UNKNOWN_SECRET_VALUE);
      expect(response.text).not.toContain(UNKNOWN_SECRET_KEY);
      // The stripped full response still equals the validated fixture config.
      expect(response.body as ConfigExportResponse).toEqual(wire(validated));
    });
  });
});

describe('config boot validation (e2e)', () => {
  afterEach(() => {
    restoreEnv();
  });

  test('an invalid boot config stops the API before the endpoint serves', async () => {
    // Boot runs during module compile: the failure happens before an application
    // instance exists, so no route could have served a request.
    const failure = await bootFailureFromConfigFile(INVALID_BOOT_CONFIG_PATH);
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toMatch(/Invalid config|GRAVESHIFT_CONFIG_INVALID/);
    // The failure names the boot block of the merged schema.
    expect(message).toContain('boot.port');
  });
});
