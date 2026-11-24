import type { LimitCounters } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import {
  build,
  fakeDaemon,
  facts,
  haunting,
  snapshot,
  ZERO_COUNTERS,
} from './mcp-daemon-read.fixture';

describe('the one private daemon read adapter', () => {
  test('every read crosses the named adapter with the authenticated Project in its body', async () => {
    const daemon = fakeDaemon();
    const { backend, tools } = await build(daemon.client);
    expect(await tools.listIncidents({ limit: 20 })).toEqual([haunting]);
    expect(await tools.listServices()).toEqual([{ name: 'api', status: 'haunting' }]);
    expect(await backend.policyContext('inc1')).toEqual(facts);
    expect(daemon.calls).toEqual([
      { url: '/internal/read/incidents', body: { projectId: 'project-1' } },
      { url: '/internal/read/services', body: { projectId: 'project-1' } },
      { url: '/internal/read/context', body: { projectId: 'project-1', incidentId: 'inc1' } },
    ]);
  });

  test('propose_fix reports the real limit status from the fake daemon', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 0,
      actionsLast10Min: 0,
      diagnosisLoops: 1,
      llmSpentTodayUsd: 0.25,
    };
    const daemon = fakeDaemon({ '/internal/read/counters': snapshot(counters) });
    const { tools } = await build(daemon.client);
    const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
      limits: { enforced: boolean; source: string; counters: LimitCounters };
      decision: { reason: string };
    };
    expect(result.limits.enforced).toBe(true);
    expect(result.limits.source).toBe('wired');
    expect(result.limits.counters).toEqual(counters);
    expect(result.decision.reason).toBe('rule:allow-pr');
    expect(daemon.calls).toContainEqual({
      url: '/internal/read/counters',
      body: { projectId: 'project-1', incidentId: 'inc1' },
    });
  });

  test('a limit reached in the daemon blocks the fix', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 1,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    };
    const { tools } = await build(
      fakeDaemon({ '/internal/read/counters': snapshot(counters) }).client,
    );
    const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
      decision: { reason: string };
    };
    expect(result.decision.reason).toBe('rate_limited');
  });

  test('propose_fix states that unwired counters do not enforce limits', async () => {
    const { tools } = await build(
      fakeDaemon({ '/internal/read/counters': snapshot(ZERO_COUNTERS, 'not_wired') }).client,
    );
    const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
      limits: { enforced: boolean; source: string; reason: string };
    };
    expect(result.limits.enforced).toBe(false);
    expect(result.limits.source).toBe('not_wired');
    expect(result.limits.reason).toContain('not enforced');
  });
});
