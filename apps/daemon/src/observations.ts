import { createHash } from 'node:crypto';
import { selectAgentByKeywords, type AgentConfig } from '@graveshift/agents';
import type { EventEnvelope, WorkItem } from '@graveshift/core';
import { CreatedWorkResultSchema } from '@graveshift/work';
import {
  prepareRecordedHaunting,
  RecordedHauntingSchema,
  type RecordedHaunting,
} from '@graveshift/core/recorded';
import { diagnose } from '@graveshift/diagnoser';
import type { Gateway } from '@graveshift/gateway';
import { createWatcher, type WatcherOutcome } from '@graveshift/watcher';

import type { PrivateApi } from './api-client';
import { withAuditScope } from './audit';
import { HttpFailure } from './private-http';
import { withModelContext } from './model-context';

/** The actor a Collector-driven observation records when no OAuth principal asked for it. */
const DAEMON_ACTOR = 'daemon';

export interface ObservationOptions {
  api: PrivateApi;
  gateway: Pick<Gateway, 'run'>;
  agents: readonly AgentConfig[];
  logs(service: string, lines: number, projectId: string): Promise<string[]>;
  /** The scope is carried on each Event and passed through to the Work caller. */
  onWork(item: WorkItem, incidentId: string, projectId: string): Promise<void>;
}

function stableId(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Groups belong to one Project and Grave, never to the service name alone. */
const serviceKey = (projectId: string, service: string) => JSON.stringify([projectId, service]);

/** A retained outcome belongs to the Project of the Event that produced it. */
const eventKey = (projectId: string, id: string) => JSON.stringify([projectId, id]);

const MAX_PENDING = 32;
const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_FAILURES = 3;

/** ADR 0030: every process-local cache has a size, an age and a FIFO bound. */
const MAX_VIEWS = 64;
const MAX_SERVICES = 128;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** FIFO cache keyed by Project; age is measured from the Event's observedAt. */
export class BoundedCache<Value> {
  private readonly rows = new Map<string, { value: Value; at: number }>();
  private readonly max: number;
  private readonly ttlMs: number;
  constructor(max: number, ttlMs: number) {
    this.max = max;
    this.ttlMs = ttlMs;
  }
  get(key: string, now: number): Value | undefined {
    const entry = this.rows.get(key);
    if (entry === undefined || now - entry.at > this.ttlMs) {
      this.rows.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key: string, value: Value, at: number): void {
    this.rows.delete(key);
    this.rows.set(key, { value, at });
    this.prune(at);
    while (this.rows.size > this.max) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
  }
  delete(key: string): void {
    this.rows.delete(key);
  }
  prune(now: number): void {
    for (const [key, entry] of this.rows) {
      if (now - entry.at > this.ttlMs) this.rows.delete(key);
    }
  }
}

interface Pending {
  at: number;
  failures: number;
  outcomes: WatcherOutcome[];
}

export async function createObservations(options: ObservationOptions) {
  const { api } = options;
  const views = new BoundedCache<RecordedHaunting>(MAX_VIEWS, CACHE_TTL_MS);
  const byService = new BoundedCache<string>(MAX_SERVICES, CACHE_TTL_MS);
  const medium =
    options.agents.find((agent) => agent.role === 'diagnosis') ??
    selectAgentByKeywords(options.agents, 'diagnose incident outage root cause');
  if (medium === undefined) throw new Error('A diagnosis Agent is required');
  let current: EventEnvelope;
  const watcher = createWatcher({
    newId: () =>
      byService.get(
        serviceKey(current.projectId, current.service),
        Date.parse(current.observedAt),
      ) ?? stableId(JSON.stringify([current.projectId, current.id])),
  });
  const pending = new Map<string, Pending>();
  const write = async (eventId: string, input: RecordedHaunting, projectId: string) => {
    const view = prepareRecordedHaunting(input);
    const persisted = await api.post(
      '/internal/hauntings',
      {
        projectId,
        eventId,
        environment: current.environment ?? undefined,
        view: {
          ...view,
          deploymentId: current.deploymentId ?? view.deploymentId ?? null,
        },
      },
      RecordedHauntingSchema,
    );
    const at = Date.parse(current.observedAt);
    views.set(eventKey(projectId, persisted.incident.id), persisted, at);
    byService.set(serviceKey(projectId, persisted.incident.service), persisted.incident.id, at);
    return persisted;
  };
  const observe = async (event: EventEnvelope): Promise<void> => {
    // ADR 0023: scope comes from the Event envelope at intake. The boot Project
    // is a host bootstrap for Collectors, not the scope of an observation.
    const projectId = event.projectId;
    current = event;
    const now = Date.parse(event.observedAt);
    for (const [key, entry] of pending) {
      if (now - entry.at > PENDING_TTL_MS) pending.delete(key);
    }
    views.prune(now);
    byService.prune(now);
    const pendingKey = eventKey(projectId, event.id);
    let outcomes = pending.get(pendingKey)?.outcomes;
    if (outcomes === undefined) {
      const active = await api.post(
        '/internal/hauntings/active',
        { projectId, service: event.service },
        RecordedHauntingSchema.nullable(),
      );
      if (
        active !== null &&
        (active.incident.service !== event.service ||
          ['resolved', 'dismissed'].includes(active.incident.state) ||
          active.detections.some((detection) => detection.projectId !== projectId))
      ) {
        throw new HttpFailure(502, 'Invalid active Haunting response');
      }
      const key = serviceKey(projectId, event.service);
      const old = byService.get(key, now);
      if (old !== undefined && old !== active?.incident.id) watcher.release(projectId, old);
      if (active === null) byService.delete(key);
      else {
        views.set(eventKey(projectId, active.incident.id), active, now);
        byService.set(key, active.incident.id, now);
      }
      outcomes = watcher.ingest(event);
      pending.set(pendingKey, {
        at: Date.parse(event.observedAt),
        failures: 0,
        outcomes,
      });
      if (pending.size > MAX_PENDING) {
        const oldest = pending.keys().next().value;
        if (oldest !== undefined) pending.delete(oldest);
      }
    }
    const processOutcome = async (outcome: WatcherOutcome) => {
      if (outcome.status !== 'accepted') return;
      const { change } = outcome;
      let prior = views.get(eventKey(projectId, change.incident.id), now);
      try {
        prior = await api.post(
          '/internal/hauntings/get',
          { projectId, id: change.incident.id },
          RecordedHauntingSchema,
        );
      } catch (error) {
        if (!(error instanceof HttpFailure) || error.status !== 404) throw error;
      }
      const detections = new Map(
        [...(prior?.detections ?? []), ...change.detections].map((entry) => [entry.id, entry]),
      );
      const view = prior?.detections.some((entry) => entry.id === outcome.detection.id)
        ? prior
        : await write(
            `${event.id}:detected:${outcome.detection.rule}`,
            {
              ...prior,
              incident: {
                ...change.incident,
                ...(prior?.incident ?? {}),
                updatedAt: change.incident.updatedAt,
                signalIds: [
                  ...new Set([...(prior?.incident.signalIds ?? []), ...change.incident.signalIds]),
                ],
              },
              severity: prior?.severity === 'critical' ? 'critical' : change.severity,
              detections: [...detections.values()],
            },
            projectId,
          );
      let diagnosed = view;
      if (view.incident.diagnosis === undefined) {
        let logs: string[] = [];
        try {
          logs = await options.logs(view.incident.service, 300, projectId);
        } catch {
          /* Detections are sufficient evidence when Collector logs are unavailable. */
        }
        const result = await withModelContext(
          { incidentId: view.incident.id, service: view.incident.service },
          () =>
            diagnose(
              {
                gateway: options.gateway,
                agent: medium.name,
                newId: () => stableId(`diagnosis:${view.incident.id}`),
              },
              {
                incident: view.incident,
                detections: change.detections,
                logs,
                files: [],
                commits: [],
              },
            ),
        );
        if (result.status === 'needs_human') {
          await write(
            `${event.id}:diagnosis:${outcome.detection.rule}`,
            {
              ...view,
              timeline: [
                ...(view.timeline ?? []),
                {
                  at: event.observedAt,
                  type: 'diagnosis.needs_human',
                  detail: result.reason,
                },
              ],
            },
            projectId,
          );
          return;
        }
        diagnosed = await write(
          `${event.id}:diagnosis:${outcome.detection.rule}`,
          {
            ...view,
            category: result.category,
            incident: { ...view.incident, state: 'diagnosed', diagnosis: result.diagnosis },
          },
          projectId,
        );
      }
      const created = await api.post(
        '/internal/work-items/from-haunting',
        {
          projectId,
          eventId: event.id,
          incidentId: diagnosed.incident.id,
        },
        CreatedWorkResultSchema,
      );
      await options.onWork(created.item, diagnosed.incident.id, projectId);
    };
    try {
      await outcomes.reduce(
        (chain, outcome) => chain.then(() => processOutcome(outcome)),
        Promise.resolve(),
      );
    } catch (error) {
      const entry = pending.get(pendingKey);
      if (entry !== undefined && ++entry.failures >= MAX_PENDING_FAILURES) {
        pending.delete(pendingKey);
      }
      throw error;
    }
    pending.delete(pendingKey);
  };
  // A Collector event carries no OAuth principal. The daemon acts on it as itself, inside the
  // Project carried by that Event; the transport has already checked the grant. A model call
  // outside an authenticated scope has no chain, so the sink refuses it and the gateway withholds.
  return (event: EventEnvelope) =>
    withAuditScope({ projectId: event.projectId, actor: DAEMON_ACTOR }, () => observe(event));
}
