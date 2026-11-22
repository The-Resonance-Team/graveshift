import { Injectable } from '@nestjs/common';
import {
  InjectHttpClient,
  type HttpQuery,
  type HttpClient,
  HttpResponseError,
} from '@nestjs/http-client';
import { type AuditEntry, CounterSnapshotSchema, type IncidentView } from '@graveshift/core';

import { DaemonUnavailableError } from './mcp.errors';
import type { CounterSnapshot, McpBackend } from './mcp.types';

const missingIncident = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && 'error' in body && body.error === 'not_found';

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

  private async read<T>(path: string, query?: HttpQuery): Promise<T> {
    try {
      const { data } = await this.http.get<T>(path, query === undefined ? {} : { query });
      return data;
    } catch (error) {
      return this.fail(error);
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
      if (
        error instanceof HttpResponseError &&
        error.status === 404 &&
        missingIncident(error.body)
      ) {
        return undefined;
      }
      return this.fail(error);
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

  async getCounters(): Promise<CounterSnapshot> {
    const data = await this.read<unknown>('/read/counters');
    try {
      return CounterSnapshotSchema.parse(data);
    } catch (error) {
      return this.fail(error);
    }
  }
}
