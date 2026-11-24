import type { RecordedHaunting } from '@graveshift/core/recorded';
import type { CollectorReads } from '@graveshift/integrations';
import { WATCHER_QUERIES } from '@graveshift/metrics';
import { describe, expect, test } from 'bun:test';

import { fakeApi } from './fake-api';
import { at, caller, context, envelope } from './flow-fixtures';
import { createReadHandler } from './read-handler';
import { createReadRuntime } from './reads';

const token = 'private-daemon-read-token-long-enough';
const apiToken = 'private-api-read-token-long-enough';

function makeFixture() {
  const facts = context();
  const view: RecordedHaunting = {
    incident: facts.incident,
    category: facts.category,
    detections: [
      {
        id: 'signal-1',
        projectId: caller.projectId,
        eventId: envelope.id,
        traceId: envelope.traceId,
        rule: 'runtime.oom',
        service: 'checkout',
        severity: 'critical',
        fingerprint: 'checkout:oom',
        message: 'oom',
        observedAt: at,
      },
    ],
  };
  const source: CollectorReads = {
    listServices: async () => [{ name: 'checkout', runtime: 'docker' }],
    getHealth: async () => ({ service: 'checkout', status: 'healthy', checkedAt: at }),
    tailLogs: async () => ['before', 'token ghp_123456789012345678901234567890123456', 'last line'],
  };
  let queries = 0;
  const calls: Array<{ path: string; body: unknown }> = [];
  const api = fakeApi((path, body) => {
    calls.push({ path, body });
    return path === '/internal/hauntings/list'
      ? [view]
      : path === '/internal/context'
        ? facts.policy
        : view;
  });
  const reads = createReadRuntime({
    api,
    sources: [source],
    metricJobs: ['checkout'],
    metrics: {
      watcher: async () => null,
      query: async () => {
        queries++;
        return 0.2;
      },
    },
  });
  const handle = createReadHandler({
    reads,
    projectIds: [caller.projectId, 'project-2'],
    token,
    maxBytes: 1024,
    timeoutMs: 1000,
  });
  const request = (action: string, fields: object = {}, bearer = token) =>
    handle(
      new Request(`http://127.0.0.1:2602/internal/read/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: caller.projectId, ...fields }),
      }),
    );
  return { request, reads, view, calls, facts, queries: () => queries };
}

describe('daemon private reads', () => {
  test('maps Collector inventory and durable Hauntings to the MCP contract', async () => {
    const fixture = makeFixture();
    expect(await (await fixture.request('services')).json()).toEqual([
      { name: 'checkout', status: 'diagnosed' },
    ]);
    expect(await (await fixture.request('incidents')).json()).toEqual([fixture.view]);
    expect(
      await (await fixture.request('incident', { id: fixture.view.incident.id })).json(),
    ).toEqual(fixture.view);
    expect(
      await (await fixture.request('context', { incidentId: fixture.view.incident.id })).json(),
    ).toMatchObject({
      service: 'checkout',
      counters: { diagnosisLoops: 1 },
    });
    expect(fixture.calls).toContainEqual({
      path: '/internal/context',
      body: {
        projectId: caller.projectId,
        service: 'checkout',
        incidentId: fixture.view.incident.id,
      },
    });
  });

  test('authenticates every private read and enforces canonical input bounds', async () => {
    const fixture = makeFixture();
    expect((await fixture.request('services', {}, 'external-token')).status).toBe(401);
    expect((await fixture.request('services', {}, apiToken)).status).toBe(401);
    expect((await fixture.request('services', { projectId: 'foreign' })).status).toBe(403);
    expect((await fixture.request('logs', { service: 'checkout', lines: 301 })).status).toBe(400);
    expect((await fixture.request('context', { id: 'wrong-field' })).status).toBe(400);
    expect((await fixture.request('unknown')).status).toBe(404);
  });

  test('a second granted Project reads its own Hauntings and policy facts', async () => {
    const fixture = makeFixture();
    const incidents = await fixture.request('incidents', { projectId: 'project-2' });
    expect(incidents.status).toBe(200);
    expect(fixture.calls).toContainEqual({
      path: '/internal/hauntings/list',
      body: { projectId: 'project-2' },
    });
    expect((await fixture.request('incidents', { projectId: 'ungranted' })).status).toBe(403);

    const incident = await fixture.request('incident', {
      projectId: 'project-2',
      id: fixture.view.incident.id,
    });
    expect(incident.status).toBe(200);
    expect(fixture.calls).toContainEqual({
      path: '/internal/hauntings/get',
      body: { projectId: 'project-2', id: fixture.view.incident.id },
    });
  });

  test('policy facts must agree with the Project of the read, not the boot Project', async () => {
    const fixture = makeFixture();
    const incidentId = fixture.view.incident.id;
    const mismatch = await fixture.request('context', { projectId: 'project-2', incidentId });
    expect(mismatch.status).toBe(503);

    const detection = fixture.view.detections[0];
    if (detection === undefined) throw new Error('Expected a recorded detection');
    fixture.view.detections = [{ ...detection, projectId: 'project-2' }];
    const accepted = await fixture.request('context', { projectId: 'project-2', incidentId });
    expect(accepted.status).toBe(200);
    expect(fixture.calls).toContainEqual({
      path: '/internal/context',
      body: { projectId: 'project-2', service: 'checkout', incidentId },
    });
  });

  test('bounds and redacts logs, and rejects unknown Graves', async () => {
    const fixture = makeFixture();
    const response = await fixture.request('logs', { service: 'checkout', lines: 2 });
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain('ghp_123456789012345678901234567890123456');
    expect(text).toContain('last line');
    expect((await fixture.request('logs', { service: 'missing', lines: 2 })).status).toBe(404);
  });

  test('runs only the configured metric queries', async () => {
    const fixture = makeFixture();
    expect((await fixture.request('metric', { promql: 'up' })).status).toBe(422);
    const response = await fixture.request('metric', {
      promql: WATCHER_QUERIES.errorRate5xx('checkout'),
    });
    expect(await response.json()).toBe(0.2);
    expect(fixture.queries()).toBe(1);
  });

  test('serves real audited counters from the same Haunting facts', async () => {
    const fixture = makeFixture();
    const response = await fixture.request('counters', {
      incidentId: fixture.view.incident.id,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: 'wired',
      counters: fixture.facts.policy.counters,
    });
    expect((await fixture.request('counters', { id: 'wrong-field' })).status).toBe(400);
  });

  test('accepts repeated recorded rule signals while keeping the durable counters', async () => {
    const fixture = makeFixture();
    const detection = fixture.view.detections[0];
    if (detection === undefined) throw new Error('Expected recorded detection');
    fixture.view.detections.push({ ...detection, id: 'signal-2', eventId: 'event-two' });
    fixture.facts.policy.signals.push(detection.rule);
    const response = await fixture.request('context', { incidentId: fixture.view.incident.id });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      counters: fixture.facts.policy.counters,
      signals: ['runtime.oom', 'runtime.oom'],
    });
  });
});
