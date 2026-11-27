import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import type { CollectorReads } from '@graveshift/integrations';
import { WATCHER_QUERIES } from '@graveshift/metrics';
import { afterEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { at, caller } from './flow-fixtures';
import { setupFlow } from './flow.fixture';
import { createReadHandler } from './read-handler';
import { createReadRuntime } from './reads';

const token = 'private-daemon-read-token-long-enough';
const apiToken = 'private-api-read-token-long-enough';

/** The same Grave facts scoped to the second granted Project. */
function otherView(view: RecordedHaunting): RecordedHaunting {
  const other = structuredClone(view);
  other.incident.id = 'incident-2';
  if (other.incident.diagnosis) other.incident.diagnosis.incidentId = 'incident-2';
  other.detections = other.detections.map((entry) => ({
    ...entry,
    id: 'other-signal',
    projectId: 'project-2',
    eventId: 'other-event',
    traceId: 'other-trace',
  }));
  return other;
}

describe.skipIf(!dbTestEnabled)('daemon private reads over the real platform', () => {
  const opened: Array<Awaited<ReturnType<typeof setupFlow>>> = [];
  const make = async () => {
    const flow = await setupFlow({ projects: [caller.projectId, 'project-2'], seed: false });
    opened.push(flow);
    const view = await flow.platform.seedHaunting();
    const source: CollectorReads = {
      listServices: async () => [{ name: 'checkout', runtime: 'docker' }],
      getHealth: async () => ({ service: 'checkout', status: 'healthy', checkedAt: at }),
      tailLogs: async () => [
        'before',
        'token ghp_123456789012345678901234567890123456',
        'last line',
      ],
    };
    let queries = 0;
    const reads = createReadRuntime({
      api: flow.platform.api,
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
      maxBytes: 4096,
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
    return { flow, request, view, queries: () => queries };
  };
  afterEach(async () => {
    await Promise.all(opened.splice(0).map((flow) => flow.close()));
  });

  test('maps Collector inventory and durable Hauntings to the MCP contract', async () => {
    const fixture = await make();
    expect(await (await fixture.request('services')).json()).toEqual([
      { name: 'checkout', status: 'diagnosed' },
    ]);
    expect(await (await fixture.request('incidents')).json()).toEqual([fixture.view]);
    expect(
      await (await fixture.request('incident', { id: fixture.view.incident.id })).json(),
    ).toEqual(fixture.view);
    expect(
      await (await fixture.request('context', { incidentId: fixture.view.incident.id })).json(),
    ).toMatchObject({ service: 'checkout', counters: { diagnosisLoops: 0 } });
    expect(fixture.flow.platform.captured).toContainEqual({
      side: 'api',
      path: '/internal/context',
      authenticated: true,
    });
  });

  test('authenticates every private read and enforces canonical input bounds', async () => {
    const fixture = await make();
    expect((await fixture.request('services', {}, 'external-token')).status).toBe(401);
    expect((await fixture.request('services', {}, apiToken)).status).toBe(401);
    expect((await fixture.request('services', { projectId: 'foreign' })).status).toBe(403);
    expect((await fixture.request('logs', { service: 'checkout', lines: 301 })).status).toBe(400);
    expect((await fixture.request('context', { id: 'wrong-field' })).status).toBe(400);
    expect((await fixture.request('unknown')).status).toBe(404);
  });

  test('a second granted Project reads its own Hauntings and policy facts', async () => {
    const fixture = await make();
    const other = otherView(fixture.view);
    await fixture.flow.platform.api.post(
      '/internal/hauntings',
      { projectId: 'project-2', eventId: 'platform:other-project', view: other },
      RecordedHauntingSchema,
    );
    const incidents = await fixture.request('incidents', { projectId: 'project-2' });
    expect(incidents.status).toBe(200);
    expect((await incidents.json()) as RecordedHaunting[]).toEqual([other]);
    expect((await fixture.request('incidents', { projectId: 'ungranted' })).status).toBe(403);
    const incident = await fixture.request('incident', {
      projectId: 'project-2',
      id: other.incident.id,
    });
    expect(incident.status).toBe(200);
  });

  test('policy facts must agree with the Project of the read, not the boot Project', async () => {
    const fixture = await make();
    const incidentId = fixture.view.incident.id;
    expect((await fixture.request('context', { projectId: 'project-2', incidentId })).status).toBe(
      404,
    );
    const other = otherView(fixture.view);
    await fixture.flow.platform.api.post(
      '/internal/hauntings',
      { projectId: 'project-2', eventId: 'platform:scope-fix', view: other },
      RecordedHauntingSchema,
    );
    const accepted = await fixture.request('context', {
      projectId: 'project-2',
      incidentId: other.incident.id,
    });
    expect(accepted.status).toBe(200);
  });

  test('bounds and redacts logs, and rejects unknown Graves', async () => {
    const fixture = await make();
    const response = await fixture.request('logs', { service: 'checkout', lines: 2 });
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain('ghp_123456789012345678901234567890123456');
    expect(text).toContain('last line');
    expect((await fixture.request('logs', { service: 'missing', lines: 2 })).status).toBe(404);
  });

  test('runs only the configured metric queries', async () => {
    const fixture = await make();
    expect((await fixture.request('metric', { promql: 'up' })).status).toBe(422);
    const response = await fixture.request('metric', {
      promql: WATCHER_QUERIES.errorRate5xx('checkout'),
    });
    expect(await response.json()).toBe(0.2);
    expect(fixture.queries()).toBe(1);
  });

  test('serves real audited counters from the same Haunting facts', async () => {
    const fixture = await make();
    const response = await fixture.request('counters', {
      incidentId: fixture.view.incident.id,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: 'wired',
      counters: { diagnosisLoops: 0, llmSpentTodayUsd: 0 },
    });
    expect((await fixture.request('counters', { id: 'wrong-field' })).status).toBe(400);
  });

  test('accepts repeated recorded rule signals while keeping the durable counters', async () => {
    const fixture = await make();
    const detection = fixture.view.detections[0];
    if (detection === undefined) throw new Error('Expected recorded detection');
    await fixture.flow.db.haunting.update({
      where: { projectId_id: { projectId: caller.projectId, id: fixture.view.incident.id } },
      data: {
        detections: [
          ...fixture.view.detections,
          { ...detection, id: 'signal-2', eventId: 'event-two' },
        ],
      },
    });
    const response = await fixture.request('context', { incidentId: fixture.view.incident.id });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signals: ['runtime.oom', 'runtime.oom'],
      counters: { diagnosisLoops: 0 },
    });
  });
});
