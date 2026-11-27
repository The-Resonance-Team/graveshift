import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled, resetDatabase } from '../../test/database/fixtures';

import { HttpMcpBackend } from './mcp.backend';
import { DaemonUnavailableError } from './mcp.errors';
import { build, openAuditRepo, startDaemon, ZERO_COUNTERS } from './mcp-daemon-read.fixture';

describe.skipIf(!dbTestEnabled)('the private read adapter fails closed', () => {
  let repo: Awaited<ReturnType<typeof openAuditRepo>>;
  beforeAll(async () => {
    repo = await openAuditRepo();
  });
  beforeEach(async () => resetDatabase(repo.db));
  afterAll(async () => repo.close());
  test('a malformed counters body makes the fix unavailable', async () => {
    const malformed: unknown[] = [
      { source: 'wired', counters: { openPrsLastHour: 0, actionsLast10Min: 0 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, llmSpentTodayUsd: -1 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, diagnosisLoops: Number.NaN } },
    ];
    await Promise.all(
      malformed.map(async (body) => {
        const daemon = startDaemon({ rawCounters: body });
        try {
          const { tools } = await build(daemon.client, repo.audit);
          await expect(tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })).rejects.toThrow(
            DaemonUnavailableError,
          );
        } finally {
          daemon.stop();
        }
      }),
    );
  });

  test('a null incident from the private read means the Haunting is absent', async () => {
    const daemon = startDaemon({ missingIncident: true });
    try {
      const { backend } = await build(daemon.client, repo.audit);
      expect(await backend.getIncident('nope')).toBeUndefined();
    } finally {
      daemon.stop();
    }
  });

  test('a read error without a valid body fails closed', async () => {
    const daemon = startDaemon({ failIncident: true });
    try {
      const { backend } = await build(daemon.client, repo.audit);
      await expect(backend.getIncident('inc1')).rejects.toThrow(DaemonUnavailableError);
    } finally {
      daemon.stop();
    }
  });

  test('a token or scope rejection gets the daemon_auth code and fails closed', async () => {
    const seeds = [{ bearer: 'wrong-token' }, { projectIds: [] }];
    await Promise.all(
      seeds.map(async (seed) => {
        const daemon = startDaemon(seed);
        try {
          const { backend } = await build(daemon.client, repo.audit);
          await expect(backend.getIncident('inc1')).rejects.toMatchObject({
            code: 'daemon_auth',
            name: 'DaemonUnavailableError',
          });
        } finally {
          daemon.stop();
        }
      }),
    );
  });

  test('the unavailable path fails closed when the daemon is down', async () => {
    const daemon = startDaemon();
    const { backend, tools } = await build(daemon.client, repo.audit);
    daemon.stop();
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
      cases.map(async ({ body, read }) => {
        const daemon = startDaemon({ malformed: body });
        try {
          const { backend } = await build(daemon.client, repo.audit);
          await expect(read(backend)).rejects.toThrow(DaemonUnavailableError);
        } finally {
          daemon.stop();
        }
      }),
    );
  });

  test('a read without an authenticated Project fails closed before any daemon call', async () => {
    const daemon = startDaemon();
    try {
      const backend = new HttpMcpBackend(
        daemon.client,
        { append: async () => ({}) } as never,
        {
          projectId: undefined,
          require: () => {
            throw new Error('An authenticated Project is required');
          },
        } as never,
        { list: async () => [], verifyChain: async () => ({ ok: true, length: 0 }) } as never,
      );
      await expect(backend.listServices()).rejects.toThrow('authenticated Project');
      expect(daemon.calls).toEqual([]);
    } finally {
      daemon.stop();
    }
  });
});
