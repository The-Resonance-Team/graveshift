import { HttpNetworkError } from '@nestjs/http-client';
import { describe, expect, test } from 'bun:test';

import { HttpMcpBackend } from './mcp.backend';
import { DaemonUnavailableError } from './mcp.errors';
import {
  build,
  fakeAuditReader,
  fakeDaemon,
  httpError,
  ZERO_COUNTERS,
} from './mcp-daemon-read.fixture';

describe('the private read adapter fails closed', () => {
  test('a malformed counters body makes the fix unavailable', async () => {
    const malformed = [
      { source: 'wired', counters: { openPrsLastHour: 0, actionsLast10Min: 0 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, llmSpentTodayUsd: -1 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, diagnosisLoops: Number.NaN } },
    ];
    await Promise.all(
      malformed.map(async (body) => {
        const { tools } = await build(fakeDaemon({ '/internal/read/counters': body }).client);
        await expect(tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })).rejects.toThrow(
          DaemonUnavailableError,
        );
      }),
    );
  });

  test('a null incident from the private read means the Haunting is absent', async () => {
    const { backend } = await build(fakeDaemon({ '/internal/read/incident': null }).client);
    expect(await backend.getIncident('nope')).toBeUndefined();
  });

  test('a read error without a valid body fails closed', async () => {
    const { backend } = await build(
      fakeDaemon({
        '/internal/read/incident': httpError(404, { message: 'Private read not found' }),
      }).client,
    );
    await expect(backend.getIncident('nope')).rejects.toThrow(DaemonUnavailableError);
  });

  test('a token error gets the daemon_auth code and still fails closed', async () => {
    await Promise.all(
      [401, 403].map(async (status) => {
        const { backend } = await build(
          fakeDaemon({
            '/internal/read/incident': httpError(status, {
              message: 'Internal authentication required',
            }),
          }).client,
        );
        await expect(backend.getIncident('inc1')).rejects.toMatchObject({
          code: 'daemon_auth',
          name: 'DaemonUnavailableError',
        });
      }),
    );
  });

  test('the unavailable path fails closed when the daemon is down', async () => {
    const down = {
      post: async () => {
        throw new HttpNetworkError({
          method: 'POST',
          url: '/internal/read/services',
          cause: new Error('ECONNREFUSED'),
        });
      },
    };
    const { backend, tools } = await build(down);
    await expect(backend.listServices()).rejects.toThrow(DaemonUnavailableError);
    await expect(backend.listIncidents()).rejects.toThrow(DaemonUnavailableError);
    await expect(backend.getIncident('inc1')).rejects.toThrow(DaemonUnavailableError);
    await expect(backend.getCounters('inc1')).rejects.toThrow(DaemonUnavailableError);
    await expect(tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })).rejects.toThrow(
      DaemonUnavailableError,
    );
  });

  test('malformed read bodies fail closed at the boundary', async () => {
    const cases: Array<{
      path: string;
      body: unknown;
      read: (backend: HttpMcpBackend) => Promise<unknown>;
    }> = [
      {
        path: '/internal/read/services',
        body: [{ name: 7 }],
        read: (backend) => backend.listServices(),
      },
      {
        path: '/internal/read/incidents',
        body: [{ nope: true }],
        read: (backend) => backend.listIncidents(),
      },
      {
        path: '/internal/read/incident',
        body: { incident: { id: 7 } },
        read: (backend) => backend.getIncident('inc1'),
      },
      {
        path: '/internal/read/context',
        body: { service: 7 },
        read: (backend) => backend.policyContext('inc1'),
      },
      { path: '/internal/read/logs', body: [7], read: (backend) => backend.tailLogs('api', 5) },
      {
        path: '/internal/read/metric',
        body: { value: '1' },
        read: (backend) => backend.queryMetric('up'),
      },
      {
        path: '/internal/read/counters',
        body: { source: 'wired' },
        read: (backend) => backend.getCounters('inc1'),
      },
    ];
    await Promise.all(
      cases.map(async ({ path, body, read }) => {
        const { backend } = await build(fakeDaemon({ [path]: body }).client);
        await expect(read(backend)).rejects.toThrow(DaemonUnavailableError);
      }),
    );
  });

  test('a read without an authenticated Project fails closed before any daemon call', async () => {
    const daemon = fakeDaemon();
    const backend = new HttpMcpBackend(
      daemon.client as never,
      { append: async () => ({}) } as never,
      {
        projectId: undefined,
        require: () => {
          throw new Error('An authenticated Project is required');
        },
      } as never,
      fakeAuditReader() as never,
    );
    await expect(backend.listServices()).rejects.toThrow('authenticated Project');
    expect(daemon.calls).toEqual([]);
  });
});
