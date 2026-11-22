import { describe, expect, test } from 'bun:test';

import { createReadState, type IncidentView } from './read-state';

const incident: IncidentView = {
  incident: {
    id: 'inc-1',
    service: 'api',
    state: 'diagnosed',
    openedAt: '2026-01-01T00:00:00.000Z',
    diagnosis: { confidence: 0.8 },
  },
  severity: 'critical',
  detections: [{ rule: 'crash_loop' }],
};

describe('daemon read state', () => {
  test('starts empty with zero counters', () => {
    const state = createReadState();
    expect(state.listServices()).toEqual([]);
    expect(state.listIncidents()).toEqual([]);
    expect(state.counters()).toEqual({
      openPrsLastHour: 0,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
  });

  test('returns recorded incidents by id', () => {
    const state = createReadState();
    state.recordIncident(incident);
    expect(state.listIncidents()).toEqual([incident]);
    expect(state.getIncident('inc-1')).toEqual(incident);
    expect(state.getIncident('missing')).toBeUndefined();
  });

  test('verifies a real audit hash chain and detects tampering', () => {
    const state = createReadState();
    state.appendAudit({
      seq: 1,
      at: '2026-01-01T00:00:00.000Z',
      actor: 'wraith',
      type: 'incident.opened',
      payload: {},
    });
    state.appendAudit({
      seq: 2,
      at: '2026-01-01T00:01:00.000Z',
      actor: 'medium',
      type: 'diagnosis.created',
      payload: {},
    });
    expect(state.verifyChain()).toEqual({ ok: true, length: 2 });
    const entries = state.listAudit(0, 10);
    expect(entries.map((entry) => entry.seq)).toEqual([1, 2]);
    entries[1]!.payload = { changed: true };
    expect(state.verifyChain().ok).toBe(false);
  });

  test('bounds a log tail and keeps the newest lines', () => {
    const state = createReadState();
    for (const line of ['one', 'two', 'three']) state.appendLog('api', line);
    expect(state.tailLogs('api', 2)).toEqual(['two', 'three']);
    expect(state.tailLogs('other', 10)).toEqual([]);
  });

  test('reads metrics and counters that the daemon owns', () => {
    const state = createReadState();
    state.setMetric('up{service="api"}', 1);
    state.setCounters({
      openPrsLastHour: 2,
      actionsLast10Min: 1,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0.5,
    });
    expect(state.queryMetric('up{service="api"}')).toBe(1);
    expect(state.queryMetric('unknown')).toBeNull();
    expect(state.counters().openPrsLastHour).toBe(2);
  });
});
