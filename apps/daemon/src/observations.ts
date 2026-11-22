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
  projectId: string;
  api: PrivateApi;
  gateway: Pick<Gateway, 'run'>;
  agents: readonly AgentConfig[];
  logs(service: string, lines: number): Promise<string[]>;
  onWork(item: WorkItem, incidentId: string): Promise<void>;
}

function stableId(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createObservations(options: ObservationOptions) {
  const { projectId, api } = options;
  const views = new Map<string, RecordedHaunting>();
  const byService = new Map<string, string>();
  const medium =
    options.agents.find((agent) => agent.role === 'diagnosis') ??
    selectAgentByKeywords(options.agents, 'diagnose incident outage root cause');
  if (medium === undefined) throw new Error('A diagnosis Agent is required');
  let current: EventEnvelope;
  const watcher = createWatcher({
    newId: () =>
      byService.get(current.service) ?? stableId(JSON.stringify([projectId, current.id])),
  });
  const pending = new Map<string, WatcherOutcome[]>();
  const write = async (eventId: string, input: RecordedHaunting) => {
    const view = prepareRecordedHaunting(input);
    const persisted = await api.post(
      '/internal/hauntings',
      { projectId, eventId, view },
      RecordedHauntingSchema,
    );
    views.set(persisted.incident.id, persisted);
    byService.set(persisted.incident.service, persisted.incident.id);
    return persisted;
  };
  const observe = async (event: EventEnvelope): Promise<void> => {
    if (event.projectId !== projectId) throw new Error('Observation belongs to another project');
    current = event;
    let outcomes = pending.get(event.id);
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
      const old = byService.get(event.service);
      if (old !== undefined && old !== active?.incident.id) watcher.release(projectId, old);
      if (active === null) byService.delete(event.service);
      else {
        views.set(active.incident.id, active);
        byService.set(event.service, active.incident.id);
      }
      outcomes = watcher.ingest(event);
      pending.set(event.id, outcomes);
    }
    const processOutcome = async (outcome: WatcherOutcome) => {
      if (outcome.status !== 'accepted') return;
      const { change } = outcome;
      let prior = views.get(change.incident.id);
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
        : await write(`${event.id}:detected:${outcome.detection.rule}`, {
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
          });
      let diagnosed = view;
      if (view.incident.diagnosis === undefined) {
        let logs: string[] = [];
        try {
          logs = await options.logs(view.incident.service, 300);
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
          await write(`${event.id}:diagnosis:${outcome.detection.rule}`, {
            ...view,
            timeline: [
              ...(view.timeline ?? []),
              {
                at: event.observedAt,
                type: 'diagnosis.needs_human',
                detail: result.reason,
              },
            ],
          });
          return;
        }
        diagnosed = await write(`${event.id}:diagnosis:${outcome.detection.rule}`, {
          ...view,
          category: result.category,
          incident: { ...view.incident, state: 'diagnosed', diagnosis: result.diagnosis },
        });
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
      await options.onWork(created.item, diagnosed.incident.id);
    };
    await outcomes.reduce(
      (chain, outcome) => chain.then(() => processOutcome(outcome)),
      Promise.resolve(),
    );
    pending.delete(event.id);
  };
  // A Collector event carries no OAuth principal. The daemon acts on it as itself, inside the
  // one Project its grant covers and the check above confirms. A model call outside this
  // binding has no chain, so the durable sink refuses it and the gateway withholds the result.
  return (event: EventEnvelope) =>
    withAuditScope({ projectId, actor: DAEMON_ACTOR }, () => observe(event));
}
