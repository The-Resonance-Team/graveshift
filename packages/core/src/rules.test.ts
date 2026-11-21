import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_RULE_ACTIONS,
  detectRuleOverrides,
  evaluateEnvelope,
  mergeRules,
  type Rule,
  RuleSchema,
} from './rules';
import type { EventEnvelope } from './schemas';

const envelope: EventEnvelope = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  source: 'collector.docker',
  service: 'api',
  type: 'signal.oom',
  severity: 'warning',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: { restarts: 3 },
};

const rule = (
  id: string,
  action: Rule['action'],
  priority: number,
  match: Rule['match'],
  enabled = true,
): Rule => ({ id, action, priority, match, enabled });

describe('rule engine', () => {
  test('RuleSchema accepts a rule and rejects an unknown action', () => {
    const valid = rule('rule-1', 'suppress', 10, { services: ['api'] });
    expect(RuleSchema.safeParse(valid).success).toBe(true);
    expect(RuleSchema.safeParse({ ...valid, action: 'delete' }).success).toBe(false);
    expect(RuleSchema.safeParse({ ...valid, priority: -1 }).success).toBe(false);
  });

  test('defaults info to telemetry and warning or critical to detection', () => {
    expect(DEFAULT_RULE_ACTIONS).toEqual({
      info: 'telemetry',
      warning: 'detect',
      critical: 'detect',
    });
    expect(evaluateEnvelope(envelope, [])).toBe('detect');
    const other = rule('rule-1', 'suppress', 0, { services: ['worker'] });
    expect(evaluateEnvelope(envelope, [other])).toBe('detect');
    expect(evaluateEnvelope({ ...envelope, severity: 'critical' }, [])).toBe('detect');
    expect(evaluateEnvelope({ ...envelope, severity: 'info' }, [])).toBe('telemetry');
  });

  test('info events never enter detection, but a rule may suppress them', () => {
    const detect = rule('detect-info', 'detect', 0, {});
    const suppress = rule('suppress-info', 'suppress', 0, {});
    expect(evaluateEnvelope({ ...envelope, severity: 'info' }, [detect])).toBe('telemetry');
    expect(evaluateEnvelope({ ...envelope, severity: 'info' }, [suppress])).toBe('suppress');
  });

  test('returns the action of one matching rule', () => {
    const matching = rule('rule-1', 'suppress', 10, { services: ['api'] });
    expect(evaluateEnvelope(envelope, [matching])).toBe('suppress');
  });

  test('uses priority order, not input order', () => {
    const late = rule('rule-z', 'suppress', 50, {});
    const early = rule('rule-a', 'escalate', 1, {});
    expect(evaluateEnvelope(envelope, [late, early])).toBe('escalate');
  });

  test('breaks a priority tie by id', () => {
    const first = rule('rule-a', 'suppress', 10, {});
    const second = rule('rule-b', 'escalate', 10, {});
    expect(evaluateEnvelope(envelope, [second, first])).toBe('suppress');
  });

  test('skips disabled rules', () => {
    const disabled = rule('rule-a', 'suppress', 0, {}, false);
    const enabled = rule('rule-b', 'escalate', 1, {});
    expect(evaluateEnvelope(envelope, [disabled, enabled])).toBe('escalate');
    expect(evaluateEnvelope(envelope, [disabled])).toBe('detect');
  });

  test('matches tenantId, service, severity and type', () => {
    const cases: Array<[Partial<EventEnvelope>, Rule['match'], Rule['action']]> = [
      [{ tenantId: 'tenant-1' }, { tenantId: 'tenant-1' }, 'suppress'],
      [{ service: 'api' }, { services: ['api'] }, 'escalate'],
      [{ severity: 'warning' }, { severities: ['warning', 'critical'] }, 'suppress'],
      [{ type: 'signal.oom' }, { types: ['signal.oom'] }, 'escalate'],
    ];
    for (const [change, match, action] of cases) {
      const candidate = rule('rule-1', action, 0, match);
      expect(evaluateEnvelope({ ...envelope, ...change }, [candidate])).toBe(action);
    }
  });

  test('does not match when one field differs', () => {
    const candidate = rule('rule-1', 'suppress', 0, {
      tenantId: 'tenant-2',
      services: ['api'],
      severities: ['critical'],
      types: ['signal.oom'],
    });
    expect(evaluateEnvelope(envelope, [candidate])).toBe('detect');
  });

  test('mergeRules overrides by id and keeps system rules', () => {
    const system = [rule('rule-1', 'suppress', 10, {}), rule('rule-2', 'detect', 20, {})];
    const client = [rule('rule-1', 'escalate', 10, {}), rule('rule-3', 'suppress', 30, {})];
    const merged = mergeRules(system, client);
    expect(merged.map((entry) => entry.id)).toEqual(['rule-1', 'rule-2', 'rule-3']);
    expect(merged[0]?.action).toBe('escalate');
    expect(merged[1]).toEqual(system[1]);
    expect(merged[2]).toEqual(client[1]);
    expect(evaluateEnvelope(envelope, merged)).toBe('escalate');
    expect(system[0]?.action).toBe('suppress');
  });

  test('detectRuleOverrides returns sorted ids and a warning', () => {
    const system = [rule('rule-b', 'suppress', 10, {}), rule('rule-a', 'suppress', 20, {})];
    const client = [rule('rule-a', 'escalate', 20, {}), rule('rule-b', 'escalate', 10, {})];
    const detection = detectRuleOverrides(system, client);
    expect(detection.ids).toEqual(['rule-a', 'rule-b']);
    expect(detection.warning).toContain('rule-a, rule-b');
    expect(detection.warning).toContain('Confirm the rule overrides before save.');
  });

  test('detectRuleOverrides returns no warning without an overlap', () => {
    const system = [rule('rule-1', 'suppress', 10, {})];
    const client = [rule('rule-2', 'escalate', 20, {})];
    expect(detectRuleOverrides(system, client)).toEqual({ ids: [], warning: '' });
  });

  test('duplicate ids do not make evaluation or merge order-dependent', () => {
    const suppress = rule('rule-dup', 'suppress', 10, { services: ['api'] });
    const escalate = rule('rule-dup', 'escalate', 10, { services: ['api'] });
    expect(evaluateEnvelope(envelope, [suppress, escalate])).toBe('escalate');
    expect(evaluateEnvelope(envelope, [escalate, suppress])).toBe('escalate');

    const systems = [rule('rule-s', 'suppress', 10, {}), rule('rule-s', 'detect', 5, {})];
    const clients = [suppress, escalate, rule('rule-c', 'escalate', 30, {})];
    const merged = mergeRules(systems, clients);
    expect(merged).toEqual(mergeRules([...systems].reverse(), [...clients].reverse()));
    expect(merged.filter((entry) => entry.id === 'rule-dup')).toHaveLength(1);
    expect(merged.find((entry) => entry.id === 'rule-dup')?.action).toBe('escalate');
    expect(merged.filter((entry) => entry.id === 'rule-s')).toHaveLength(1);
    expect(merged.find((entry) => entry.id === 'rule-s')?.action).toBe('detect');
  });

  test('gives the same output for the same input', () => {
    const system = [rule('rule-1', 'suppress', 10, {})];
    const client = [rule('rule-1', 'escalate', 10, {}), rule('rule-2', 'detect', 5, {})];
    const rules = [...client, ...system];
    const before = structuredClone(rules);

    const first = {
      action: evaluateEnvelope(envelope, rules),
      merged: mergeRules(system, client),
      detection: detectRuleOverrides(system, client),
    };
    const second = {
      action: evaluateEnvelope(envelope, rules),
      merged: mergeRules(system, client),
      detection: detectRuleOverrides(system, client),
    };

    expect(second).toEqual(first);
    expect(rules).toEqual(before);
  });
});
