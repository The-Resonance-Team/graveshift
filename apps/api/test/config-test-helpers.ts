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
import { AuditRepo, type AuditAppendInput } from '../src/audit/repo/audit.repo';

export const FAKE_CONFIG = new URL('./fixtures/config.fake.yaml', import.meta.url);
export const FAKE_CONFIG_PATH = fileURLToPath(FAKE_CONFIG);
export const INVALID_BOOT_CONFIG_PATH = fileURLToPath(
  new URL('./fixtures/config.invalid-boot.yaml', import.meta.url),
);

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
export const CLIENTS = {
  read: { id: 'client-config-read', secret: 'test-client-secret-config-read' },
  export: { id: 'client-config-export', secret: 'test-client-secret-config-export' },
  unrelated: { id: 'client-no-config', secret: 'test-client-secret-no-config' },
} as const;

export const READ_ROUTES = ['/api/config/agents', '/api/config/policy'] as const;
export const EXPORT_ROUTES = ['/api/config/agents/export', '/api/config/policy/export'] as const;

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
export async function appFromConfigFile(
  path: string,
  audit: FakeAuditRepo = new FakeAuditRepo(),
): Promise<{ app: INestApplication; audit: FakeAuditRepo }> {
  withFakeEnv(path);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuditRepo)
    .useValue(audit)
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

// The one source the endpoints must serve: the same validated object the boot
// provider holds. No route reads a YAML file per request.
export const validated = parseGraveshiftConfig(Bun.YAML.parse(await Bun.file(FAKE_CONFIG).text()));

// The exact dashboard view the fake config must produce. Written by hand from the
// fixture: a whitelist change in the projection that drops or leaks a field fails here.
export const EXPECTED_AGENTS_VIEW = {
  system: [
    {
      name: 'Test Agent',
      slug: 'test-agent',
      role: 'tester',
      description: 'Handles fake incidents for tests.',
      provider: '@ai-sdk/openai',
      model: 'fake-test-model',
      dailyBudgetUsd: 1,
    },
  ],
  client: [
    {
      name: 'Client Agent',
      slug: 'client-agent',
      role: 'client-tester',
      description: 'Handles fake deployments for tests.',
      provider: '@ai-sdk/openai-compatible',
      model: 'fake-client-model',
      dailyBudgetUsd: 0.5,
      escalateTo: 'test-agent',
    },
  ],
};

export const EXPECTED_POLICY_VIEW = {
  version: 1,
  mode: 'dry-run',
  limits: {
    maxOpenPrsPerHour: 1,
    maxActionsPerServicePer10Min: 1,
    maxDiagnosisLoops: 1,
    llmDailyBudgetUsd: 0.5,
  },
  llm: { minConfidenceForPr: 0.9, minConfidenceForAction: 0.95 },
  rules: [{ id: 'fake-deny-db', action: '*', when: { services: ['postgres'] }, effect: 'deny' }],
  default: 'deny',
};

// The sanitized view must not carry these keys in any form.
export const SANITIZE_ABSENT_KEYS = [
  '"prompt"',
  '"params"',
  '"baseUrl"',
  '"apiKeyEnv"',
  '"allowedTools"',
  '"approvers"',
  '"discordUserIds"',
  '"discordRoleIds"',
  '"github"',
  '"repos"',
  '"repo"',
  '"baseBranch"',
  '"branchPrefix"',
  '"allowedPaths"',
  '"forbiddenPaths"',
];

// JSON round-trip mirrors the wire format: express serializes the same way and drops
// absent optional keys, so the comparison is against what the client actually parses.
export function wire<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
