import { Injectable } from '@nestjs/common';
import {
  InjectHttpClient,
  type HttpQuery,
  type HttpClient,
  HttpResponseError,
} from '@nestjs/http-client';
import {
  AuditEntriesSchema,
  type AuditEntry,
  type ChainResult,
  ChainResultSchema,
  CounterSnapshotSchema,
  IncidentViewSchema,
  IncidentViewsSchema,
  LogLinesSchema,
  MetricValueSchema,
  type ServiceView,
  ServiceViewsSchema,
} from '@graveshift/core';

import { DaemonUnavailableError } from './mcp.errors';
import type { CounterSnapshot, IncidentView, McpBackend } from './mcp.types';

const missingIncident = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && 'error' in body && body.error === 'not_found';

interface Parser<T> {
  parse(value: unknown): T;
}

/** The one client of the daemon read surface. A read failure never becomes empty data. */
@Injectable()
export class HttpMcpBackend implements McpBackend {
  constructor(@InjectHttpClient('daemon-read') private readonly http: HttpClient) {}

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

  verifyChain(): Promise<ChainResult> {
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
}
