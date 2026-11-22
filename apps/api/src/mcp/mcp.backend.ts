import { Injectable } from '@nestjs/common';
import {
  InjectHttpClient,
  type HttpQuery,
  type HttpClient,
  HttpResponseError,
} from '@nestjs/http-client';
import type { AuditEntry } from '@graveshift/core';

import { DaemonUnavailableError } from './mcp.errors';
import type { IncidentView, LimitCounters, McpBackend } from './mcp.types';

/** The one client of the daemon read surface. A read failure never becomes empty data. */
@Injectable()
export class HttpMcpBackend implements McpBackend {
  constructor(@InjectHttpClient('daemon-read') private readonly http: HttpClient) {}

  private async read<T>(path: string, query?: HttpQuery): Promise<T> {
    try {
      const { data } = await this.http.get<T>(path, query === undefined ? {} : { query });
      return data;
    } catch (error) {
      throw new DaemonUnavailableError(error);
    }
  }

  listServices(): Promise<unknown[]> {
    return this.read<unknown[]>('/read/services');
  }

  listIncidents(): Promise<IncidentView[]> {
    return this.read<IncidentView[]>('/read/incidents');
  }

  async getIncident(id: string): Promise<IncidentView | undefined> {
    try {
      const { data } = await this.http.get<IncidentView>('/read/incidents/:id', {
        params: { id },
      });
      return data;
    } catch (error) {
      if (error instanceof HttpResponseError && error.status === 404) return undefined;
      throw new DaemonUnavailableError(error);
    }
  }

  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]> {
    return this.read<AuditEntry[]>('/read/audit', opts);
  }

  verifyChain(): Promise<unknown> {
    return this.read<unknown>('/read/audit/verify');
  }

  tailLogs(service: string, lines: number): Promise<string[]> {
    return this.read<string[]>('/read/logs', { service, lines });
  }

  async queryMetric(promql: string): Promise<number | null> {
    const data = await this.read<{ value: number | null }>('/read/metrics', { promql });
    return data.value;
  }

  getCounters(): Promise<LimitCounters> {
    return this.read<LimitCounters>('/read/counters');
  }
}
