import { parseGraveshiftConfig } from '@graveshift/config';
import type { AgentsConfigResponse, PolicyConfigResponse } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';

const FAKE_CONFIG = new URL('./fixtures/config.fake.yaml', import.meta.url);
const FAKE_CONFIG_PATH = fileURLToPath(FAKE_CONFIG);
const INVALID_BOOT_CONFIG_PATH = fileURLToPath(
  new URL('./fixtures/config.invalid-boot.yaml', import.meta.url),
);

// Test-only values for the env names the fake config points at. No real secret.
// The tests prove these values never appear in a config response.
const FAKE_ENV_VALUES: Record<string, string> = {
  GRAVESHIFT_TEST_AGENT_API_KEY: 'sk-fake-agent-key-never-returned',
  GRAVESHIFT_TEST_CLIENT_API_KEY: 'sk-fake-client-key-never-returned',
  GRAVESHIFT_TEST_GITHUB_APP_ID: '42424242',
  GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY: 'FAKE-PRIVATE-KEY-MATERIAL-NEVER-RETURNED',
};

// The name and value of an unknown key with a secret shape. AgentConfigSchema and
// AgentsFileSchema are strict, so an Agent block key stops boot. PolicySchema is not
// strict and strips it at boot. Either way the value must never reach a response.
const UNKNOWN_SECRET_KEY = 'secretToken';
const UNKNOWN_SECRET_VALUE = 'sk-fake-unknown-key-secret-never-returned';

function withFakeEnv(path: string): void {
  process.env.GRAVESHIFT_CONFIG_PATH = path;
  for (const [name, value] of Object.entries(FAKE_ENV_VALUES)) process.env[name] = value;
}

function restoreEnv(): void {
  if (originalConfigPath === undefined) delete process.env.GRAVESHIFT_CONFIG_PATH;
  else process.env.GRAVESHIFT_CONFIG_PATH = originalConfigPath;
  for (const name of Object.keys(FAKE_ENV_VALUES)) delete process.env[name];
}

const originalConfigPath = process.env.GRAVESHIFT_CONFIG_PATH;

// The boot provider reads GRAVESHIFT_CONFIG_PATH when the module instantiates, so the
// test sets it before building the app and restores it after every test.
// The suite boots through @nestjs/testing: NestFactory.create exits the process on a
// boot error, and the boot-validation tests must catch the error instead.
async function appFromConfigFile(path: string): Promise<INestApplication> {
  withFakeEnv(path);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

async function bootFailureFromConfigFile(path: string): Promise<unknown> {
  withFakeEnv(path);
  return Test.createTestingModule({ imports: [AppModule] })
    .compile()
    .then(
      (moduleRef) => {
        void moduleRef.close();
        return undefined;
      },
      (error: unknown) => error,
    );
}

// One config file in a private temp dir, so a test can write a broken variant without
// touching a committed fixture. The directory is removed when the test ends.
async function withTempConfigFile<T>(
  name: string,
  text: string,
  run: (path: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-config-e2e-'));
  const path = join(dir, name);
  try {
    await Bun.write(path, text);
    return await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The one source the endpoints must serve: the same validated object the boot
// provider holds. No route reads a YAML file per request.
const validated = parseGraveshiftConfig(Bun.YAML.parse(await Bun.file(FAKE_CONFIG).text()));

// JSON round-trip mirrors the wire format: express serializes the same way and drops
// absent optional keys, so the comparison is against what the client actually parses.
function wire<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('config read-only API (e2e)', () => {
  let app!: INestApplication;

  beforeEach(async () => {
    app = await appFromConfigFile(FAKE_CONFIG_PATH);
  });

  afterEach(async () => {
    await app.close();
    restoreEnv();
  });

  test('GET /api/config/agents returns the exact validated Agent config', async () => {
    const response = await request(app.getHttpServer()).get('/api/config/agents').expect(200);
    const body = response.body as AgentsConfigResponse;
    expect(body).toEqual(wire(validated.agents));
    expect(body.system[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_AGENT_API_KEY');
    expect(body.client[0]?.apiKeyEnv).toBe('GRAVESHIFT_TEST_CLIENT_API_KEY');
  });

  test('GET /api/config/policy returns the exact validated policy config', async () => {
    const response = await request(app.getHttpServer()).get('/api/config/policy').expect(200);
    const body = response.body as PolicyConfigResponse;
    expect(body).toEqual(wire(validated.policy));
    expect(body.default).toBe('deny');
  });

  test('config responses hold env names only and no secret value', async () => {
    const agents = await request(app.getHttpServer()).get('/api/config/agents').expect(200);
    const policy = await request(app.getHttpServer()).get('/api/config/policy').expect(200);
    const bodies = `${agents.text}\n${policy.text}`;
    for (const value of Object.values(FAKE_ENV_VALUES)) {
      expect(bodies).not.toContain(value);
    }
    // The names are present, which shows the values were not resolved into them.
    expect(agents.text).toContain('GRAVESHIFT_TEST_AGENT_API_KEY');
  });

  test('the routes serve the boot snapshot and never re-read the YAML file', async () => {
    // The app already booted from this file. Mutate it on disk: if a route re-read the
    // file, the response would change. The response must stay the boot-time snapshot.
    const original = await Bun.file(FAKE_CONFIG).text();
    try {
      await Bun.write(FAKE_CONFIG, original.replaceAll('Test Agent', 'Mutated Agent'));
      const response = await request(app.getHttpServer()).get('/api/config/agents').expect(200);
      expect(response.text).not.toContain('Mutated Agent');
      const body = response.body as AgentsConfigResponse;
      expect(body.system[0]?.name).toBe('Test Agent');
      expect(body).toEqual(wire(validated.agents));
    } finally {
      await Bun.write(FAKE_CONFIG, original);
    }
  });

  test('the config routes expose no write endpoint', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all([
      request(server).post('/api/config/agents'),
      request(server).put('/api/config/agents'),
      request(server).patch('/api/config/agents'),
      request(server).delete('/api/config/agents'),
      request(server).post('/api/config/policy'),
      request(server).put('/api/config/policy'),
      request(server).patch('/api/config/policy'),
      request(server).delete('/api/config/policy'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404, 404, 404, 404, 404,
    ]);
  });
});

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
      const created = await appFromConfigFile(path);
      app = created;
      const agents = await request(created.getHttpServer()).get('/api/config/agents').expect(200);
      const policy = await request(created.getHttpServer()).get('/api/config/policy').expect(200);
      const bodies = `${agents.text}\n${policy.text}`;
      expect(bodies).not.toContain(UNKNOWN_SECRET_VALUE);
      expect(bodies).not.toContain(UNKNOWN_SECRET_KEY);
      // The stripped response still equals the validated fixture policy.
      expect(policy.body as PolicyConfigResponse).toEqual(wire(validated.policy));
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
