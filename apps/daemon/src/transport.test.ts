import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { BOOT_CONFIG } from '../../api/src/config/boot.config';
import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO } from '../../api/src/identity/identity.types';
import { PrismaIdentityRepo } from '../../api/src/identity/repo/identity.repo';
import type { PrismaService } from '../../api/src/infra/prisma.service';
import { InternalConfigController } from '../../api/src/internal/internal-config.controller';
import { InternalGuard } from '../../api/src/internal/internal.guard';
import { ProjectGrant } from '../../api/src/internal/project-grant';
import { testProjectGrant } from '../../api/src/internal/testing/project-grant.fixture';
import { dbTestEnabled, openTestDatabase, resetDatabase } from '../../api/test/database/fixtures';
import { createPrivateApi } from './api-client';
import { createAudit, gatewayAudit } from './audit';
import { BootConfigSchema, configuredGateway, loadBootConfig } from './boot-config';
import { readDaemonConfig } from './config';
import { contextClient } from './fix-context';
import { agent, caller, diagnosis, item, policy, withFixAuditScope } from './flow-fixtures';
import { createPlatform, TEST_BASE_SHA } from './platform.fixture';

const apiToken = 'local-api-internal-token-long-enough';
const daemonToken = 'local-daemon-internal-token-long-enough';
const gateway = {
  globalDailyBudgetUsd: 10,
  maxRetries: 0,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 2 } },
};
const boot = {
  projectIds: ['12345'],
  agents: [agent()],
  policy,
  gateway,
  natsStream: 'GRAVESHIFT_EVENTS',
};

describe('daemon private transport and config', () => {
  test('requires private auth and project settings and rejects public addresses', () => {
    const env = {
      GRAVESHIFT_API_INTERNAL_TOKEN: apiToken,
      GRAVESHIFT_DAEMON_INTERNAL_TOKEN: daemonToken,
    };
    const config = readDaemonConfig(env);
    expect(config.GRAVESHIFT_API_URL).toBe('http://127.0.0.1:3000');
    expect(config.GRAVESHIFT_DAEMON_URL).toBe('http://127.0.0.1:2602');
    expect(() => readDaemonConfig({})).toThrow('configuration is invalid');
    expect(() =>
      readDaemonConfig({ ...env, GRAVESHIFT_DAEMON_URL: 'http://0.0.0.0:2602' }),
    ).toThrow();
    expect(() =>
      readDaemonConfig({ ...env, GRAVESHIFT_API_URL: 'http://127.attacker.test:3000' }),
    ).toThrow();
    expect(() =>
      readDaemonConfig({ ...env, GRAVESHIFT_API_URL: 'http://secret@127.0.0.1:3000' }),
    ).toThrow();
    expect(() =>
      readDaemonConfig({
        ...env,
        GRAVESHIFT_API_INTERNAL_TOKEN: 'placeholder-secret-value-long-enough',
      }),
    ).toThrow();
    expect(() =>
      readDaemonConfig({
        ...env,
        GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'placeholder-secret-value-long-enough',
      }),
    ).toThrow();
    expect(() => readDaemonConfig({ ...env, GRAVESHIFT_API_INTERNAL_TOKEN: 'short' })).toThrow();
    expect(() =>
      readDaemonConfig({
        ...env,
        GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'has a space and is long enough token',
      }),
    ).toThrow();
    expect(() => readDaemonConfig({ ...env, GRAVESHIFT_DAEMON_INTERNAL_TOKEN: apiToken })).toThrow(
      'configuration is invalid',
    );
  });

  test('boot rejects secret fields and an empty gateway price table', async () => {
    expect(BootConfigSchema.safeParse({ ...boot, projectIds: ['project-1'] }).success).toBe(false);
    expect(BootConfigSchema.safeParse({ ...boot, apiKey: 'must-not-cross-http' }).success).toBe(
      false,
    );
    expect(() => configuredGateway(boot, async () => {}, {})).toThrow('apiKeyEnv');
    expect(() =>
      configuredGateway(
        { ...boot, gateway: { ...gateway, priceTableUsdPer1M: {} } },
        async () => {},
        { GRAVESHIFT_RECORDING_KEY: 'local-provider-test-key' },
      ),
    ).toThrow('price table');
  });
});

describe.skipIf(!dbTestEnabled)('daemon private seams over the real platform', () => {
  const opened: Array<{ close: () => Promise<unknown> }> = [];
  const make = async () => {
    const db = await openTestDatabase();
    await resetDatabase(db);
    const platform = await createPlatform(db);
    opened.push({
      close: async () => {
        await platform.close();
        await db.onModuleDestroy();
      },
    });
    return { db, platform };
  };
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((entry) => entry.close()));
  });

  /** The real InternalConfigController, backed by a seeded daemon grant. */
  async function configApi(db: PrismaService) {
    const identity = new PrismaIdentityRepo(db);
    const org = await db.organization.create({
      data: { id: 'config-org', name: 'Config', slug: 'config' },
    });
    await db.project.create({
      data: { projectId: '12345', orgId: org.id, name: 'Config', slug: 'config' },
    });
    await identity.addGrant({
      id: crypto.randomUUID(),
      name: DEFAULT_DAEMON_GRANT,
      projectIds: ['12345'],
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalConfigController],
      providers: [
        InternalGuard,
        { provide: ProjectGrant, useValue: testProjectGrant(['12345']) },
        { provide: BOOT_CONFIG, useValue: { ...boot, databaseUrl: 'postgresql://localhost/test' } },
        { provide: IDENTITY_REPO, useValue: identity },
        {
          provide: ConfigService,
          useValue: new ConfigService({ GRAVESHIFT_API_INTERNAL_TOKEN: apiToken }),
        },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication({ logger: false });
    await app.init();
    opened.push({ close: () => app.close() });
    const fetcher = Object.assign(
      async (input: Request | string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const outgoing = request(app.getHttpServer()).get(url.pathname + url.search);
        const auth = new Headers(init?.headers).get('authorization');
        if (auth !== null) outgoing.set('authorization', auth);
        const response = await outgoing.send();
        return new Response(response.text, { status: response.status });
      },
      { preconnect: () => {} },
    );
    return createPrivateApi({
      origin: 'http://127.0.0.1:3000',
      token: apiToken,
      timeoutMs: 1000,
      fetch: fetcher,
    });
  }

  test('boot consumes the stored project grant', async () => {
    const { db } = await make();
    expect(await loadBootConfig(await configApi(db))).toEqual(BootConfigSchema.parse(boot));
  });

  test('gateway audit acknowledgement follows the durable append', async () => {
    const { db, platform } = await make();
    const write = createAudit(platform.api);
    const ack = await withFixAuditScope(() =>
      gatewayAudit(write)({
        callId: 'call-1',
        agent: 'Assigned Agent',
        task: 'route_work',
        status: 'ok',
        tokensIn: 4,
        tokensOut: 2,
        costUsd: 0.01,
      }),
    );
    expect(ack).toEqual({ callId: 'call-1' });
    expect(await db.auditEntry.findMany({ select: { eventKey: true } })).toEqual([
      { eventKey: 'gateway:call-1' },
    ]);
  });

  test('context maps the real Grave and rejects invalid or unavailable facts', async () => {
    const { db, platform } = await make();
    await platform.seedHaunting();
    const snapshot = { item: item(), version: 1, diagnosis };
    const result = await contextClient(platform.api, policy)(caller, snapshot);
    expect(result.repo.services).toEqual(['checkout']);
    expect(result.deploymentId).toBe(TEST_BASE_SHA);
    const mismatched = { ...snapshot, diagnosis: { ...diagnosis, confidence: 0.5 } };
    await expect(contextClient(platform.api, policy)(caller, mismatched)).rejects.toMatchObject({
      failure: 'invalid_context',
    });
    await db.haunting.deleteMany();
    await expect(contextClient(platform.api, policy)(caller, snapshot)).rejects.toMatchObject({
      failure: 'context_unavailable',
    });
  });
});
