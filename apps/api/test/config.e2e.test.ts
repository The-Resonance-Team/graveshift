import { parseGraveshiftConfig } from '@graveshift/config';
import type { AgentsConfigResponse, PolicyConfigResponse } from '@graveshift/api-contract';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';

const FAKE_CONFIG = new URL('./fixtures/config.fake.yaml', import.meta.url);
const INVALID_BOOT_CONFIG = new URL('./fixtures/config.invalid-boot.yaml', import.meta.url);

// Test-only values for the env names the fake config points at. No real secret.
// The tests prove these values never appear in a config response.
const FAKE_ENV_VALUES: Record<string, string> = {
  GRAVESHIFT_TEST_AGENT_API_KEY: 'sk-fake-agent-key-never-returned',
  GRAVESHIFT_TEST_CLIENT_API_KEY: 'sk-fake-client-key-never-returned',
  GRAVESHIFT_TEST_GITHUB_APP_ID: '42424242',
  GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY: 'FAKE-PRIVATE-KEY-MATERIAL-NEVER-RETURNED',
};

function withFakeEnv(path: URL): void {
  process.env.GRAVESHIFT_CONFIG_PATH = path.pathname;
  for (const [name, value] of Object.entries(FAKE_ENV_VALUES)) process.env[name] = value;
}

// The boot provider reads GRAVESHIFT_CONFIG_PATH when the module instantiates, so the
// test sets it before building the app and restores it after every test.
// The suite boots through @nestjs/testing: NestFactory.create exits the process on a
// boot error, and the boot-validation test must catch the error instead.
async function appWithConfig(path: URL): Promise<INestApplication> {
  withFakeEnv(path);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
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
  const originalConfigPath = process.env.GRAVESHIFT_CONFIG_PATH;

  beforeEach(async () => {
    app = await appWithConfig(FAKE_CONFIG);
  });

  afterEach(async () => {
    await app.close();
    if (originalConfigPath === undefined) delete process.env.GRAVESHIFT_CONFIG_PATH;
    else process.env.GRAVESHIFT_CONFIG_PATH = originalConfigPath;
    for (const name of Object.keys(FAKE_ENV_VALUES)) delete process.env[name];
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
    expect(agents.text).not.toContain('sk-fake');
  });

  test('the config routes expose no write endpoint', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all([
      request(server).post('/api/config/agents'),
      request(server).put('/api/config/agents'),
      request(server).post('/api/config/policy'),
      request(server).put('/api/config/policy'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });
});

describe('config boot validation (e2e)', () => {
  const originalConfigPath = process.env.GRAVESHIFT_CONFIG_PATH;

  afterEach(() => {
    if (originalConfigPath === undefined) delete process.env.GRAVESHIFT_CONFIG_PATH;
    else process.env.GRAVESHIFT_CONFIG_PATH = originalConfigPath;
  });

  test('an invalid boot config stops the API before any config route serves', async () => {
    process.env.GRAVESHIFT_CONFIG_PATH = INVALID_BOOT_CONFIG.pathname;
    // Boot runs during module compile: the failure happens before an application
    // instance exists, so no route could have served a request.
    const boot = Test.createTestingModule({ imports: [AppModule] }).compile();
    const failure = await boot.then(
      (moduleRef) => {
        void moduleRef.close();
        return undefined;
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toMatch(/Invalid config|GRAVESHIFT_CONFIG_INVALID/);
    // The failure names the boot block of the merged schema.
    expect(message).toContain('boot.port');
  });
});
