import type { LimitCounters } from '@graveshift/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled, resetDatabase } from '../../test/database/fixtures';

import {
  build,
  facts,
  haunting,
  openAuditRepo,
  snapshot,
  startDaemon,
  ZERO_COUNTERS,
} from './mcp-daemon-read.fixture';

describe.skipIf(!dbTestEnabled)('the one private daemon read adapter', () => {
  let repo: Awaited<ReturnType<typeof openAuditRepo>>;
  beforeAll(async () => {
    repo = await openAuditRepo();
  });
  beforeEach(async () => resetDatabase(repo.db));
  afterAll(async () => repo.close());
  test('a read crosses a real local daemon listener over HTTP', async () => {
    const daemon = startDaemon();
    try {
      const { tools } = await build(daemon.client, repo.audit);
      expect(await tools.listIncidents({ limit: 20 })).toEqual([haunting]);
      expect(daemon.calls).toContainEqual({
        url: '/internal/read/incidents',
        body: { projectId: 'project-1' },
      });
    } finally {
      daemon.stop();
    }
  });

  test('every read crosses the named adapter with the authenticated Project in its body', async () => {
    const daemon = startDaemon({ serviceStatus: 'haunting' });
    try {
      const { backend, tools } = await build(daemon.client, repo.audit);
      expect(await tools.listIncidents({ limit: 20 })).toEqual([haunting]);
      expect(await tools.listServices()).toEqual([{ name: 'api', status: 'haunting' }]);
      expect(await backend.policyContext('inc1')).toEqual(facts);
      expect(daemon.calls).toEqual([
        { url: '/internal/read/incidents', body: { projectId: 'project-1' } },
        { url: '/internal/read/services', body: { projectId: 'project-1' } },
        { url: '/internal/read/context', body: { projectId: 'project-1', incidentId: 'inc1' } },
      ]);
    } finally {
      daemon.stop();
    }
  });

  test('propose_fix reports the real limit status from the daemon', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 0,
      actionsLast10Min: 0,
      diagnosisLoops: 1,
      llmSpentTodayUsd: 0.25,
    };
    const daemon = startDaemon({ counters: snapshot(counters) });
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
        limits: { enforced: boolean; source: string; counters: LimitCounters };
        decision: { reason: string };
        executed: boolean;
      };
      expect(result.executed).toBe(false);
      expect(result.limits.enforced).toBe(true);
      expect(result.limits.source).toBe('wired');
      expect(result.limits.counters).toEqual(counters);
      expect(result.decision.reason).toBe('rule:allow-pr');
      expect(daemon.calls).toContainEqual({
        url: '/internal/read/counters',
        body: { projectId: 'project-1', incidentId: 'inc1' },
      });
    } finally {
      daemon.stop();
    }
  });

  test('a limit reached in the daemon blocks the fix', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 1,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    };
    const daemon = startDaemon({ counters: snapshot(counters) });
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
        decision: { reason: string };
        executed: boolean;
      };
      expect(result.decision.reason).toBe('rate_limited');
      expect(result.executed).toBe(false);
    } finally {
      daemon.stop();
    }
  });

  test('propose_fix states that unwired counters do not enforce limits', async () => {
    const daemon = startDaemon({ counters: snapshot(ZERO_COUNTERS, 'not_wired') });
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
        limits: { enforced: boolean; source: string; reason: string };
      };
      expect(result.limits.enforced).toBe(false);
      expect(result.limits.source).toBe('not_wired');
      expect(result.limits.reason).toContain('not enforced');
    } finally {
      daemon.stop();
    }
  });
});
