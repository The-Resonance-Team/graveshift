import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InjectHttpClient,
  type HttpQuery,
  type HttpClient,
  HttpResponseError,
} from '@nestjs/http-client';
import {
  AuditEntriesSchema,
  type AuditDraft,
  type AuditEntry,
  ChainResultSchema,
  CounterSnapshotSchema,
  type CounterSnapshot,
  type IncidentView,
  IncidentViewSchema,
  IncidentViewsSchema,
  LogLinesSchema,
  MetricValueSchema,
  type ServiceView,
  ServiceViewsSchema,
} from '@graveshift/core';
import {
  SharedPolicyContextSchema,
  type SharedPolicyContext,
} from '@graveshift/core/policy-context';
import { prepareRecordedHaunting, RecordedHauntingSchema } from '@graveshift/core/recorded';
import { z } from 'zod';

import type { VerifyResult } from '../audit/audit.types';
import { AuditRepo } from '../audit/audit.repo';
import { ProjectGrant } from '../internal/project-grant';
import { DaemonUnavailableError } from './mcp.errors';
import type { McpBackend } from './mcp.types';

const missingIncident = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && 'error' in body && body.error === 'not_found';

interface Parser<T> {
  parse(value: unknown): T;
}

/**
 * The platform-v2 daemon read surface. Its record shape is the daemon's
 * IncidentView; the tools read it structurally as incident facts.
 */
@Injectable()
export class HttpMcpBackend {
  constructor(
    @InjectHttpClient('daemon-read') private readonly http: HttpClient,
    @Optional() private readonly audit?: AuditRepo,
    @Optional() private readonly grant?: ProjectGrant,
  ) {}

  private fail(error: unknown): never {
    if (error instanceof HttpResponseError && (error.status === 401 || error.status === 403)) {
      throw new DaemonUnavailableError(error, 'daemon_auth');
    }
    throw new DaemonUnavailableError(error);
  }

  private async read<T>(path: string, parser: Parser<T>, query?: HttpQuery): Promise<T> {
    try {
      const { data } = await this.http.get<unknown>(path, query === undefined ? {} : { query });
      return parser.parse(data);
    } catch (error) {
      return this.fail(error);
    }
  }

  listServices(): Promise<ServiceView[]> {
    return this.read('/read/services', ServiceViewsSchema);
  }

  listIncidents(): Promise<IncidentView[]> {
    return this.read('/read/incidents', IncidentViewsSchema);
  }

  async getIncident(id: string): Promise<IncidentView | undefined> {
    const response = await this.http
      .get<unknown>('/read/incidents/:id', { params: { id } })
      .catch((error: unknown) => {
        if (
          error instanceof HttpResponseError &&
          error.status === 404 &&
          missingIncident(error.body)
        ) {
          return undefined;
        }
        return this.fail(error);
      });
    if (response === undefined) return undefined;
    try {
      return IncidentViewSchema.parse(response.data);
    } catch (error) {
      return this.fail(error);
    }
  }

  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]> {
    return this.read('/read/audit', AuditEntriesSchema, opts);
  }

  verifyChain(): Promise<VerifyResult> {
    // Redaction stays in McpTools, after parsing and before the tool answer.
    return this.read('/read/audit/verify', ChainResultSchema);
  }

  tailLogs(service: string, lines: number): Promise<string[]> {
    return this.read('/read/logs', LogLinesSchema, { service, lines });
  }

  async queryMetric(promql: string): Promise<number | null> {
    const { value } = await this.read('/read/metrics', MetricValueSchema, { promql });
    return value;
  }

  getCounters(): Promise<CounterSnapshot> {
    return this.read('/read/counters', CounterSnapshotSchema);
  }

  /** Complete facts derived from the same daemon reads the tools use. */
  async policyContext(incidentId: string): Promise<SharedPolicyContext> {
    const view = await this.getIncident(incidentId);
    if (view === undefined) throw new DaemonUnavailableError(new Error('incident not found'));
    const snapshot = await this.getCounters();
    return SharedPolicyContextSchema.parse({
      service: view.incident.service,
      ...(view.category === undefined ? {} : { category: view.category }),
      signals: (view.detections ?? []).map((entry: { rule: string }) => entry.rule),
      confidence: view.incident.diagnosis?.confidence ?? 0,
      counters: snapshot.counters,
    });
  }

  async auditDecision(draft: AuditDraft): Promise<Pick<AuditDraft, 'key'>> {
    // ponytail: the daemon read API has no append route; persist in the API-owned
    // audit store using the Project from the stored deployment grant.
    if (this.audit && this.grant) await this.audit.append(await this.grant.first(), draft);
    return { key: draft.key };
  }
}

const servicesSchema = z.array(
  z.strictObject({
    name: z.string().min(1),
    runtime: z.enum(['docker', 'k8s']),
    namespace: z.string().min(1).optional(),
  }),
);

/** The durable model-audit backend. Reads daemon facts and owns audit acknowledgement. */
@Injectable()
export class DaemonMcpBackend implements McpBackend {
  constructor(
    @InjectHttpClient('daemon') private readonly http: HttpClient,
    private readonly audit: AuditRepo,
    private readonly config: ConfigService,
    private readonly grant: ProjectGrant,
  ) {}

  private async projectId(): Promise<string> {
    return this.grant.first();
  }

  private async read<Schema extends z.ZodType>(path: string, input: object, schema: Schema) {
    const { data } = await this.http.post<unknown>(`/internal/read/${path}`, {
      headers: {
        authorization: `Bearer ${this.config.getOrThrow<string>('GRAVESHIFT_DAEMON_INTERNAL_TOKEN')}`,
      },
      json: { projectId: await this.projectId(), ...input },
    });
    return schema.parse(data);
  }

  async listServices() {
    const services = await this.read('services', {}, servicesSchema);
    return services.map(({ namespace, ...service }) => ({
      ...service,
      ...(namespace === undefined ? {} : { namespace }),
    }));
  }

  async listIncidents() {
    const views = await this.read('incidents', {}, z.array(RecordedHauntingSchema));
    return views.map(prepareRecordedHaunting);
  }

  async getIncident(id: string) {
    try {
      const view = await this.read('incident', { id }, RecordedHauntingSchema.nullable());
      return view === null ? undefined : prepareRecordedHaunting(view);
    } catch (error) {
      if (error instanceof HttpResponseError && error.status === 404) return undefined;
      throw error;
    }
  }

  async listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]> {
    return this.audit.list(await this.projectId(), opts);
  }

  async verifyChain(): Promise<VerifyResult> {
    return this.audit.verifyChain(await this.projectId());
  }

  tailLogs(service: string, lines: number) {
    return this.read('logs', { service, lines }, z.array(z.string()));
  }

  queryMetric(promql: string) {
    return this.read('metric', { promql }, z.number().nullable());
  }

  getCounters(): Promise<CounterSnapshot> {
    return this.read('counters', {}, CounterSnapshotSchema);
  }

  async policyContext(incidentId: string): Promise<SharedPolicyContext> {
    try {
      return await this.read('context', { incidentId }, SharedPolicyContextSchema);
    } catch {
      throw new ServiceUnavailableException('Complete policy facts are unavailable');
    }
  }

  async auditDecision(draft: AuditDraft) {
    await this.audit.append(await this.projectId(), draft);
    return { key: draft.key };
  }
}
