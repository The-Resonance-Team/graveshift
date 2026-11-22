import { AuditDraftSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { createPrivateApi } from './api-client';
import { createAudit, gatewayAudit } from './audit';
import { BootConfigSchema, configuredGateway, loadBootConfig } from './boot-config';
import { readDaemonConfig } from './config';
import { fakeApi } from './fake-api';
import { contextClient } from './fix-context';
import { agent, caller, context, diagnosis, item, policy } from './flow-fixtures';
import { createWorkClient } from './work-client';

const apiToken = 'local-api-internal-token-long-enough';
const daemonToken = 'local-daemon-internal-token-long-enough';
const gateway = {
  globalDailyBudgetUsd: 10,
  maxRetries: 0,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'recorded-model': { in: 1, out: 2 } },
};
const boot = {
  projectId: caller.projectId,
  agents: [agent()],
  policy,
  gateway,
  natsStream: 'GRAVESHIFT_EVENTS',
};

describe('daemon private transport and config', () => {
  test('requires private auth and project settings and rejects public addresses', () => {
    const env = {
      GRAVESHIFT_PROJECT_ID: caller.projectId,
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

  test('boot consumes resolved canonical config and rejects secret fields or another project', async () => {
    expect(
      await loadBootConfig(
        fakeApi(() => boot),
        caller.projectId,
      ),
    ).toEqual(BootConfigSchema.parse(boot));
    await expect(
      loadBootConfig(
        fakeApi(() => ({ ...boot, projectId: 'foreign' })),
        caller.projectId,
      ),
    ).rejects.toThrow('another project');
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

  test('Work state paths and auth use the canonical private contract', async () => {
    const received: Array<{ url: URL; init?: RequestInit }> = [];
    const fetcher = Object.assign(
      async (input: Request | string | URL, init?: RequestInit) => {
        received.push({ url: new URL(String(input)), ...(init === undefined ? {} : { init }) });
        return Response.json({ item: item(), version: 3, diagnosis });
      },
      { preconnect: () => {} },
    );
    const api = createPrivateApi({
      origin: 'http://127.0.0.1:3000',
      token: apiToken,
      timeoutMs: 1000,
      fetch: fetcher,
    });
    const work = createWorkClient(api);
    expect((await work.read({ projectId: caller.projectId, id: 'work/1' })).version).toBe(3);
    const sent = received[0];
    expect(sent?.url.pathname).toBe('/internal/work-items/work%2F1/read');
    expect(new Headers(sent?.init?.headers).get('authorization')).toBe(`Bearer ${apiToken}`);
    expect(sent?.init?.redirect).toBe('error');
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ projectId: caller.projectId });
    await expect(api.get('https://remote.test/internal/config', z.unknown())).rejects.toThrow(
      'path is invalid',
    );
  });

  test('rejects the daemon token on the API hop', async () => {
    const fetcher = Object.assign(
      async (_input: Request | string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (headers.get('authorization') !== `Bearer ${apiToken}`) {
          return Response.json({ message: 'Internal authentication required' }, { status: 401 });
        }
        return Response.json({ item: item(), version: 3, diagnosis });
      },
      { preconnect: () => {} },
    );
    const api = createPrivateApi({
      origin: 'http://127.0.0.1:3000',
      token: daemonToken,
      timeoutMs: 1000,
      fetch: fetcher,
    });
    await expect(
      createWorkClient(api).read({ projectId: caller.projectId, id: 'work/1' }),
    ).rejects.toThrow('Private API request failed');
  });

  test('gateway audit acknowledgement follows the durable append and checks the exact key', async () => {
    const saved: string[] = [];
    const write = createAudit(
      fakeApi((_path, body) => {
        const request = z.object({ projectId: z.string(), draft: AuditDraftSchema }).parse(body);
        saved.push(request.draft.key);
        return { key: request.draft.key };
      }),
      caller.projectId,
    );
    const ack = await gatewayAudit(write)({
      callId: 'call-1',
      agent: 'Assigned Agent',
      task: 'route_work',
      status: 'ok',
      tokensIn: 4,
      tokensOut: 2,
      costUsd: 0.01,
    });
    expect(saved).toEqual(['gateway:call-1']);
    expect(ack).toEqual({ callId: 'call-1' });
    await expect(
      createAudit(
        fakeApi(() => ({ key: 'wrong-key' })),
        caller.projectId,
      )({
        key: 'wanted',
        actor: 'daemon',
        type: 'test',
        payload: {},
      }),
    ).rejects.toThrow('does not match');
  });

  test('context maps the actual Grave and rejects unavailable or mismatched facts', async () => {
    const facts = context();
    const view = {
      incident: facts.incident,
      category: facts.category,
      detections: [
        {
          id: 'signal-1',
          projectId: caller.projectId,
          eventId: 'event-1',
          traceId: 'trace-1',
          rule: 'runtime.oom',
          service: 'checkout',
          severity: 'critical',
          fingerprint: 'checkout:oom',
          message: 'oom',
          observedAt: diagnosis.createdAt,
        },
      ],
    };
    const api = fakeApi((path, body) => {
      expect(body).toEqual({
        projectId: caller.projectId,
        service: 'checkout',
        diagnosisRef: diagnosis.id,
      });
      return path === '/internal/context' ? facts.policy : view;
    });
    const result = await contextClient(api, policy)(caller, {
      item: item(),
      version: 1,
      diagnosis,
    });
    expect(result.repo.services).toEqual(['checkout']);
    const detection = view.detections[0];
    if (detection === undefined) throw new Error('Expected recorded detection');
    view.detections.push({ ...detection, id: 'signal-2', eventId: 'event-2' });
    facts.policy.signals.push(detection.rule);
    const repeated = await contextClient(api, policy)(caller, {
      item: item(),
      version: 1,
      diagnosis,
    });
    expect(repeated.policy.counters).toEqual(facts.policy.counters);
    const invalid = fakeApi((path) =>
      path === '/internal/context' ? { ...facts.policy, confidence: 0 } : view,
    );
    await expect(
      contextClient(invalid, policy)(caller, { item: item(), version: 1, diagnosis }),
    ).rejects.toMatchObject({ failure: 'invalid_context' });
    await expect(
      contextClient(
        fakeApi(() => {
          throw new Error('No facts');
        }),
        policy,
      )(caller, { item: item(), version: 1, diagnosis }),
    ).rejects.toMatchObject({ failure: 'context_unavailable' });
  });
});
