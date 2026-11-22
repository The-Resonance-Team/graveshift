import { parseGraveshiftConfig } from '@graveshift/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { CREDENTIAL_CONFIG, type AuthConfig } from '../src/auth/auth.types';
import { AuditRepo, type AuditAppendInput } from '../src/audit/repo/audit.repo';
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { TEST_CONFIG } from './fakes/auth-test-config';
import { testIdentityRepo } from './fakes/auth-test-helpers';

export const FAKE_CONFIG = new URL('./fixtures/config.fake.yaml', import.meta.url);
export const FAKE_CONFIG_PATH = fileURLToPath(FAKE_CONFIG);
export const INVALID_BOOT_CONFIG_PATH = fileURLToPath(
  new URL('./fixtures/config.invalid-boot.yaml', import.meta.url),
);
// The one config endpoint. No other config path exists.
export const CONFIG_EXPORT_ROUTE = '/api/config/export';

// Test-only values for the env names the fake config points at. No real secret.
// The tests prove these values never appear in a config response.
export const FAKE_ENV_VALUES: Record<string, string> = {
  GRAVESHIFT_TEST_AGENT_API_KEY: 'sk-fake-agent-key-never-returned',
  GRAVESHIFT_TEST_CLIENT_API_KEY: 'sk-fake-client-key-never-returned',
  GRAVESHIFT_TEST_GITHUB_APP_ID: '42424242',
  GRAVESHIFT_TEST_GITHUB_PRIVATE_KEY: 'FAKE-PRIVATE-KEY-MATERIAL-NEVER-RETURNED',
};

// The name and value of an unknown key with a secret shape. AgentConfigSchema and
// AgentsFileSchema are strict, so an Agent block key stops boot. PolicySchema is not
// strict and strips it at boot. Either way the value must never reach a response.
export const UNKNOWN_SECRET_KEY = 'secretToken';
export const UNKNOWN_SECRET_VALUE = 'sk-fake-unknown-key-secret-never-returned';

// Test-only OAuth clients from apps/api/test/setup.ts. Their secrets are placeholders.
// The unrelated client has no config scope; it is used to prove scope denial.
export const CLIENTS = {
  export: { id: 'client-config-export', secret: 'test-client-secret-config-export' },
  unrelated: { id: 'client-no-config', secret: 'test-client-secret-no-config' },
} as const;

function withFakeEnv(path: string): void {
  process.env.GRAVESHIFT_CONFIG_PATH = path;
  for (const [name, value] of Object.entries(FAKE_ENV_VALUES)) process.env[name] = value;
}

const originalConfigPath = process.env.GRAVESHIFT_CONFIG_PATH;

export function restoreEnv(): void {
  if (originalConfigPath === undefined) delete process.env.GRAVESHIFT_CONFIG_PATH;
  else process.env.GRAVESHIFT_CONFIG_PATH = originalConfigPath;
  for (const name of Object.keys(FAKE_ENV_VALUES)) delete process.env[name];
}

/** Records every audit append instead of writing to PostgreSQL. */
export class FakeAuditRepo {
  readonly appended: AuditAppendInput[] = [];
  failure: Error | undefined;

  append(input: AuditAppendInput): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    this.appended.push(input);
    return Promise.resolve({ seq: this.appended.length });
  }
}

// The boot provider reads GRAVESHIFT_CONFIG_PATH when the module instantiates, so the
// test sets it before building the app and restores it after every test.
// The suite boots through @nestjs/testing: NestFactory.create exits the process on a
// boot error, and the boot-validation tests must catch the error instead.
// CREDENTIAL_CONFIG is pinned so the auth config (and with it the ThrottlerGuard limit,
// which ThrottlerModule.forRootAsync injects) is explicit per app, as in buildAuthApp.
// The OAuth client registry is the in-memory store, so no env JSON is needed.
export async function appFromConfigFile(
  path: string,
  audit: FakeAuditRepo = new FakeAuditRepo(),
  credential: Partial<AuthConfig> = {},
): Promise<{ app: INestApplication; audit: FakeAuditRepo }> {
  withFakeEnv(path);
  const credentialConfig: AuthConfig = {
    ...TEST_CONFIG,
    ...credential,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuditRepo)
    .useValue(audit)
    .overrideProvider(CREDENTIAL_CONFIG)
    .useValue(credentialConfig)
    .overrideProvider(IDENTITY_REPO)
    .useValue(testIdentityRepo())
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, audit };
}

export async function bootFailureFromConfigFile(path: string): Promise<unknown> {
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

// One config file in a private temp dir, so a test can write a broken variant or
// remove the file after boot without touching a committed fixture.
export async function withTempConfigFile<T>(
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

export async function bearerToken(
  app: INestApplication,
  clientId: string,
  secret: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/oauth/token')
    .send({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret })
    .expect(200);
  return response.body.access_token as string;
}

// The one source the endpoint must serve: the same validated object the boot provider
// holds. No handler reads a YAML file per request.
export const validated = parseGraveshiftConfig(Bun.YAML.parse(await Bun.file(FAKE_CONFIG).text()));

// JSON round-trip mirrors the wire format: express serializes the same way and drops
// absent optional keys, so the comparison is against what the client actually parses.
export function wire<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
