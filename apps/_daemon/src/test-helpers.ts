import { Database } from 'bun:sqlite';

import type { RuntimeEvent, RuntimeSource } from '@graveshift/core';
import { diagnose } from '@graveshift/diagnoser';
import { createGateway } from '@graveshift/llm';
import { loadPolicy } from '@graveshift/policy';
import { createSqliteAuditStore } from '@graveshift/store';
import { createWatcher } from '@graveshift/watcher';

import { createFlow, type FlowDeps } from './flow';
import { createHttp, type HttpDeps } from './http';
import { createRegistry } from './registry';

export const policy = await loadPolicy(`${import.meta.dir}/../../../policy.example.yaml`);

export function fakeSource(
  logs: string[] = [],
): RuntimeSource & { emit: (e: RuntimeEvent) => void } {
  let listener: ((e: RuntimeEvent) => void) | undefined;
  return {
    listServices: async () => [
      { name: 'api', runtime: 'docker' },
      { name: 'worker', runtime: 'docker' },
    ],
    getHealth: async (service) => ({
      service,
      status: 'healthy',
      checkedAt: new Date().toISOString(),
    }),
    tailLogs: async () => logs,
    watchEvents: async (cb) => {
      listener = cb;
      return () => (listener = undefined);
    },
    close: async () => {},
    emit: (e) => listener?.(e),
  };
}

export function stack(
  over: { logs?: string[]; flow?: Partial<FlowDeps>; http?: Partial<HttpDeps> } = {},
) {
  const registry = createRegistry();
  const audit = createSqliteAuditStore(new Database(':memory:'));
  const source = fakeSource(over.logs);
  const gateway = createGateway({
    providers: [],
    config: { timeoutMs: 1000, maxRetries: 0, priceTableUsdPer1M: {} },
    dailyBudgetUsd: 1,
  });
  const flow = createFlow({
    registry,
    audit,
    policy,
    diagnose: (input) => diagnose({ gateway }, input),
    tailLogs: (service) => source.tailLogs(service, 300),
    ...over.flow,
  });
  const pending: Array<Promise<void>> = [];
  let n = 0;
  const watcher = createWatcher({
    onOutcome: (o) => void pending.push(flow.onOutcome(o)),
    newId: () => `inc-${++n}`,
  });
  const handle = createHttp({
    registry,
    audit,
    source,
    mode: { policy: 'propose', effective: 'propose' },
    heartbeatMs: 50,
    ...over.http,
  });
  const settle = async (): Promise<void> => {
    const batch = pending.splice(0);
    if (batch.length === 0) return;
    await Promise.all(batch);
    return settle();
  };
  return { registry, audit, source, watcher, handle, settle };
}

export const oom = (service = 'worker', at = '2026-11-20T10:00:00.000Z'): RuntimeEvent => ({
  kind: 'signal',
  signal: {
    id: `s-${service}-${at}`,
    service,
    kind: 'oom',
    severity: 'critical',
    source: 'docker',
    fingerprint: `${service}:oom`,
    message: 'container oom',
    observedAt: at,
  },
});

export const get = (handle: (r: Request) => Promise<Response>, path: string) =>
  handle(new Request(`http://daemon${path}`));
