import { Inject, Injectable } from '@nestjs/common';
import { InjectHttpClient, type HttpClient, HttpResponseError } from '@nestjs/http-client';
import {
  LogLinesSchema,
  type AuditDraft,
  type AuditEntry,
  type CounterSnapshot,
  CounterSnapshotSchema,
  type ServiceView,
  ServiceViewsSchema,
} from '@graveshift/core';
import { type RecordedHaunting, RecordedHauntingSchema } from '@graveshift/core/recorded';
import {
  SharedPolicyContextSchema,
  type SharedPolicyContext,
} from '@graveshift/core/policy-context';
import { z } from 'zod';

import type { VerifyResult } from '../audit/audit.types';
import { AUDIT_READER, type AuditReader, AUDIT_SINK, type AuditSink } from '../audit/audit.sink';
import { DaemonUnavailableError } from './mcp.errors';
import { McpProjectContext } from './mcp-project-context';
import type { AuditAcknowledgement, McpAuditWriter } from './mcp.types';

interface Parser<T> {
  parse(value: unknown): T;
}

const COUNT = z.number().nullable();

/**
 * The one named adapter from the API to daemon reads. It POSTs a command to
 * `/internal/read/<action>` with the authenticated Project, over the ADR 0020
 * private hop. The API-owned audit chain is read by `AuditReader`, not here.
 */
@Injectable()
export class HttpMcpBackend implements McpAuditWriter {
  constructor(
    @InjectHttpClient('daemon-read') private readonly http: HttpClient,
    @Inject(AUDIT_SINK) private readonly audit: AuditSink,
    private readonly projectContext: McpProjectContext,
    @Inject(AUDIT_READER) private readonly auditReader: AuditReader,
  ) {}

  private fail(error: unknown): never {
    if (error instanceof HttpResponseError && (error.status === 401 || error.status === 403)) {
      throw new DaemonUnavailableError(error, 'daemon_auth');
    }
    throw new DaemonUnavailableError(error);
  }

  private async read<T>(action: string, fields: object, parser: Parser<T>): Promise<T> {
    const projectId = this.projectContext.require();
    try {
      const { data } = await this.http.post<unknown>(`/internal/read/${action}`, {
        json: { projectId, ...fields },
      });
      return parser.parse(data);
    } catch (error) {
      return this.fail(error);
    }
  }

  listServices(): Promise<ServiceView[]> {
    return this.read('services', {}, ServiceViewsSchema);
  }

  listIncidents(): Promise<RecordedHaunting[]> {
    return this.read('incidents', {}, z.array(RecordedHauntingSchema));
  }

  async getIncident(id: string): Promise<RecordedHaunting | undefined> {
    const view = await this.read('incident', { id }, RecordedHauntingSchema.nullable());
    return view ?? undefined;
  }

  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]> {
    const projectId = this.projectContext.require();
    return this.auditReader.list(projectId, opts);
  }

  verifyChain(): Promise<VerifyResult> {
    const projectId = this.projectContext.require();
    return this.auditReader.verifyChain(projectId);
  }

  tailLogs(service: string, lines: number): Promise<string[]> {
    return this.read('logs', { service, lines }, LogLinesSchema);
  }

  async queryMetric(promql: string): Promise<number | null> {
    return this.read('metric', { promql }, COUNT);
  }

  getCounters(incidentId: string): Promise<CounterSnapshot> {
    return this.read('counters', { incidentId }, CounterSnapshotSchema);
  }

  /** Complete facts derived from the same durable state the tools read. */
  policyContext(incidentId: string): Promise<SharedPolicyContext> {
    return this.read('context', { incidentId }, SharedPolicyContextSchema);
  }

  /**
   * ADR 0022: report an acknowledgement only after the append to the authenticated Project's
   * chain succeeds. stdio binds no Project, so that path returns an explicit refusal and the
   * tool withholds its result; a key returned without an append is never an acknowledgement.
   */
  async auditDecision(draft: AuditDraft): Promise<AuditAcknowledgement> {
    const projectId = this.projectContext.projectId;
    if (projectId === undefined) return { acknowledged: false, reason: 'no_project' };
    await this.audit.append(projectId, draft);
    return { acknowledged: true, key: draft.key };
  }
}
