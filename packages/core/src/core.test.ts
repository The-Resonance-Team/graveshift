import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { parseConfig, loadConfigFile } from './config';
import { runRuntimeSourceContract } from './contract';
import { ConfigError } from './errors';
import { action, approval, diagnosis, incidentAt } from './fixtures';
import { type RuntimeEvent, RuntimeEventSchema, type RuntimeSource } from './runtime-source';
import {
  ActionProposalSchema,
  ApprovalSchema,
  AuditEntrySchema,
  DiagnosisSchema,
  IncidentSchema,
  SignalSchema,
} from './schemas';

const signal = {
  id: 'sig-1',
  service: 'api',
  kind: 'oom',
  severity: 'critical',
  source: 'k8s',
  fingerprint: 'api:oom',
  message: 'OOMKilled',
  observedAt: '2026-11-20T10:00:00.000Z',
};

describe('schemas', () => {
  test('accept valid fixtures', () => {
    SignalSchema.parse(signal);
    IncidentSchema.parse(incidentAt('diagnosed', diagnosis));
    DiagnosisSchema.parse(diagnosis);
    ActionProposalSchema.parse(action);
    ApprovalSchema.parse(approval);
    AuditEntrySchema.parse({
      seq: 1,
      at: signal.observedAt,
      actor: 'wraith',
      type: 'signal.observed',
      payload: {},
      prevHash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });
  });

  test('reject malformed input', () => {
    expect(SignalSchema.safeParse({ ...signal, kind: 'nope' }).success).toBe(false);
    expect(DiagnosisSchema.safeParse({ ...diagnosis, evidence: [] }).success).toBe(false);
    expect(ActionProposalSchema.safeParse({ ...action, kind: 'scale' }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...approval, decidedAt: 'yesterday' }).success).toBe(false);
  });

  test('property: diagnosis confidence is accepted iff within [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (confidence) => {
        expect(DiagnosisSchema.safeParse({ ...diagnosis, confidence }).success).toBe(
          confidence >= 0 && confidence <= 1,
        );
      }),
    );
  });
});

describe('config', () => {
  test('loads the example config', async () => {
    const config = await loadConfigFile(
      `${import.meta.dir}/../../../graveshift.config.example.yaml`,
    );
    expect(config.llm.chain).toEqual(['bedrock', 'gemini', 'ollama']);
  });

  test('rejects invalid config with a typed error', () => {
    expect(() => parseConfig({ llm: { chain: [] } })).toThrow(ConfigError);
  });
});

class FakeSource implements RuntimeSource {
  private listeners = new Set<(event: RuntimeEvent) => void>();

  async listServices() {
    return [{ name: 'api', runtime: 'docker' as const }];
  }
  async watchEvents(cb: (event: RuntimeEvent) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  async tailLogs(_service: string, lines: number) {
    return ['a', 'b', 'c'].slice(0, lines);
  }
  async getHealth(service: string) {
    return { service, status: 'healthy' as const, checkedAt: signal.observedAt };
  }
  async close() {
    this.listeners.clear();
  }
}

runRuntimeSourceContract('in-memory fake', () => new FakeSource());

describe('RuntimeEvent', () => {
  test('parses the disconnect event', () => {
    RuntimeEventSchema.parse({
      kind: 'source_disconnected',
      at: signal.observedAt,
      reason: 'EOF',
    });
  });
});
