import type { ConfigExportResponse, ConfigPolicyExportResponse } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import {
  CLIENTS,
  FAKE_CONFIG,
  INVALID_BOOT_CONFIG_PATH,
  UNKNOWN_SECRET_KEY,
  UNKNOWN_SECRET_VALUE,
  WHOLE_EXPORT_ROUTE,
  appFromConfigFile,
  bearerToken,
  bootFailureFromConfigFile,
  restoreEnv,
  validated,
  wire,
  withTempConfigFile,
} from './config-test-helpers';

describe('config secret hygiene (e2e)', () => {
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
      const built = await appFromConfigFile(path);
      app = built.app;
      const token = await bearerToken(built.app, CLIENTS.export.id, CLIENTS.export.secret);
      const readToken = await bearerToken(built.app, CLIENTS.read.id, CLIENTS.read.secret);
      const responses = await Promise.all([
        request(built.app.getHttpServer())
          .get('/api/config/agents/export')
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
        request(built.app.getHttpServer())
          .get('/api/config/policy/export')
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
        request(built.app.getHttpServer())
          .get(WHOLE_EXPORT_ROUTE)
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
        request(built.app.getHttpServer())
          .get('/api/config/policy')
          .set('Authorization', `Bearer ${readToken}`)
          .expect(200),
      ]);
      const bodies = responses.map((response) => response.text).join('\n');
      expect(bodies).not.toContain(UNKNOWN_SECRET_VALUE);
      expect(bodies).not.toContain(UNKNOWN_SECRET_KEY);
      // The stripped full response still equals the validated fixture policy.
      const [, policyExport, wholeExport] = responses;
      expect(policyExport?.body as ConfigPolicyExportResponse).toEqual(wire(validated.policy));
      // The whole-config export serves the same stripped policy object.
      const wholeBody = wholeExport?.body as ConfigExportResponse | undefined;
      expect(wholeBody?.policy).toEqual(wire(validated.policy));
    });
  });
});

describe('config boot validation (e2e)', () => {
  afterEach(() => {
    restoreEnv();
  });

  test('an invalid boot config stops the API before any config route serves', async () => {
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
