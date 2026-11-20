import { Injectable } from '@nestjs/common';
import type { AuditEntry } from '@graveshift/core';

import type { IncidentView, McpBackend } from './mcp.types';

/**
 * ponytail: the v2 daemon serves only /healthz, so the v1 read endpoints are gone and every verb returns an empty
 * result. Upgrade this provider with HTTP reads when the daemon exposes a read API.
 */
@Injectable()
export class UnavailableMcpBackend implements McpBackend {
  async listServices(): Promise<unknown[]> {
    return [];
  }

  async listIncidents(): Promise<IncidentView[]> {
    return [];
  }

  async getIncident(_id: string): Promise<IncidentView | undefined> {
    return undefined;
  }

  async listAudit(_opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]> {
    return [];
  }

  async verifyChain(): Promise<unknown> {
    return { ok: false, unavailable: true, reason: 'the daemon exposes no audit read API' };
  }

  async tailLogs(_service: string, _lines: number): Promise<string[]> {
    return [];
  }

  async queryMetric(_promql: string): Promise<number | null> {
    return null;
  }
}
