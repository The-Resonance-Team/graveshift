import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import {
  SharedPolicyContextSchema,
  type SharedPolicyContext,
} from '@graveshift/core/policy-context';
import type { CollectorReads, GraveInfo } from '@graveshift/integrations';
import { WATCHER_QUERIES, type MetricsClient } from '@graveshift/metrics';
import { redact } from '@graveshift/redactor';
import { z } from 'zod';

import type { PrivateApi } from './api-client';
import { HttpFailure } from './private-http';

export interface ReadRuntime {
  services(): Promise<GraveInfo[]>;
  incidents(): Promise<RecordedHaunting[]>;
  incident(id: string): Promise<RecordedHaunting | null>;
  logs(service: string, lines: number): Promise<string[]>;
  metric(promql: string): Promise<number | null>;
  context(id: string): Promise<SharedPolicyContext>;
}

export interface ReadOptions {
  projectId: string;
  api: PrivateApi;
  sources: readonly CollectorReads[];
  metrics?: MetricsClient;
  metricJobs: readonly string[];
}

export function createReadRuntime(options: ReadOptions): ReadRuntime {
  const { api, projectId } = options;
  const inventory = async () =>
    (
      await Promise.all(
        options.sources.map(async (source) =>
          (await source.listServices()).map((info) => ({ info, source })),
        ),
      )
    ).flat();
  return {
    async services() {
      return (await inventory()).map(({ info }) => info);
    },
    incidents: () =>
      api.post('/internal/hauntings/list', { projectId }, z.array(RecordedHauntingSchema)),
    async incident(id) {
      try {
        return await api.post('/internal/hauntings/get', { projectId, id }, RecordedHauntingSchema);
      } catch (error) {
        if (error instanceof HttpFailure && error.status === 404) return null;
        throw error;
      }
    },
    async context(id) {
      const view = await api.post(
        '/internal/hauntings/get',
        { projectId, id },
        RecordedHauntingSchema,
      );
      const diagnosis = view.incident.diagnosis;
      if (diagnosis === undefined) throw new HttpFailure(503, 'Diagnosis is unavailable');
      const facts = await api.post(
        '/internal/context',
        { projectId, service: view.incident.service, incidentId: view.incident.id },
        SharedPolicyContextSchema,
      );
      if (
        facts.service !== view.incident.service ||
        facts.confidence !== diagnosis.confidence ||
        facts.category !== view.category ||
        view.detections.some((entry) => entry.projectId !== projectId) ||
        new Set(facts.signals).size !== new Set(view.detections.map((entry) => entry.rule)).size ||
        view.detections.some((entry) => !facts.signals.includes(entry.rule))
      ) {
        throw new HttpFailure(503, 'Complete policy facts are unavailable');
      }
      return facts;
    },
    async logs(service, lines) {
      const matches = (await inventory()).filter(({ info }) => info.name === service);
      const found = matches[0];
      if (matches.length !== 1 || found === undefined)
        throw new HttpFailure(404, 'Grave not found');
      return redact((await found.source.tailLogs(service, lines)).join('\n'))
        .split('\n')
        .slice(-lines);
    },
    async metric(promql) {
      if (options.metrics === undefined) throw new HttpFailure(503, 'Metrics are unavailable');
      const allowed = options.metricJobs.flatMap((job) =>
        Object.values(WATCHER_QUERIES).map((query) => query(job)),
      );
      if (!allowed.includes(promql)) throw new HttpFailure(422, 'Metric query is not allowlisted');
      return options.metrics.query(promql);
    },
  };
}
