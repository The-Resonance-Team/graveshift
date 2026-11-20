import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import fc from 'fast-check';

import { contrastRatio } from './contrast';
import { applyDaemonEvent } from './data/incident-cache';
import {
  formatTime,
  graveStatus,
  patchGraveyard,
  phaseOf,
  reachedPhases,
  upsertIncident,
} from './data/incident-model';
import { keys } from './query-keys';
import { TERMS } from './terms';
import type { Grave, IncidentView } from './types';
import { backoffMs } from './use-live';

const css = await Bun.file(`${import.meta.dir}/../app/globals.css`).text();
const token = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
  if (!match?.[1]) throw new Error(`missing token ${name}`);
  return match[1];
};

const view = (
  over: Partial<IncidentView['incident']> = {},
  rest: Partial<IncidentView> = {},
): IncidentView => ({
  incident: {
    id: 'inc-1',
    service: 'api',
    state: 'diagnosed',
    signalIds: ['s1'],
    openedAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:01:00.000Z',
    ...over,
  },
  severity: 'critical',
  detections: [],
  timeline: [],
  ...rest,
});

describe('design contract', () => {
  test('palette tokens match DESIGN.md exactly', () => {
    expect(
      [token('night'), token('ectoplasm'), token('pumpkin'), token('blood')].map((c) =>
        c.toLowerCase(),
      ),
    ).toEqual(['#0b0f14', '#7cffb2', '#ff7a1a', '#e5484d']);
  });

  test('every text colour reaches 4.5:1 on every surface it is used on', () => {
    for (const surface of ['night', 'crypt']) {
      for (const text of ['bone', 'fog', 'ectoplasm', 'pumpkin', 'blood']) {
        expect([surface, text, contrastRatio(token(text), token(surface)) >= 4.5]).toEqual([
          surface,
          text,
          true,
        ]);
      }
    }
    expect(contrastRatio(token('night'), token('pumpkin'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('night'), token('ectoplasm'))).toBeGreaterThanOrEqual(4.5);
    // hover surfaces: fog and bone sit on mist; coloured status text only ever sits on night or crypt
    expect(contrastRatio(token('fog'), token('mist'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('bone'), token('mist'))).toBeGreaterThanOrEqual(4.5);
  });

  test('the Term table matches DESIGN.md row for row', async () => {
    const design = await Bun.file(`${import.meta.dir}/../../../../DESIGN.md`).text();
    const rows = design
      .split('\n')
      .filter(
        (line) =>
          line.split('|').length === 4 &&
          !line.startsWith('|') &&
          !line.startsWith('---') &&
          !line.startsWith('Internal'),
      )
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .map(([, label, , plain]) => ({ label, plain }));
    expect(rows.length).toBe(Object.keys(TERMS).length);
    const ours: Array<{ label: string | undefined; plain: string | undefined }> = Object.values(
      TERMS,
    ).map((t) => ({ label: t.label, plain: t.plain }));
    expect(ours).toEqual(rows);
  });

  test('reduced motion is honoured globally', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).not.toMatch(/animation:|@keyframes/);
  });
});

describe('incident model', () => {
  test('grave status maps health and incidents to tones and terms', () => {
    const base: Grave = { name: 'api', runtime: 'docker', health: 'healthy' };
    expect(graveStatus(base)).toMatchObject({ tone: 'calm', term: 'healthy' });
    expect(graveStatus({ ...base, health: 'unhealthy' })).toMatchObject({
      tone: 'critical',
      term: null,
    });
    expect(
      graveStatus({ ...base, incidentId: 'i', severity: 'warning', state: 'awaiting_approval' }),
    ).toMatchObject({ tone: 'warning', term: 'incident', plain: 'incident is awaiting approval' });
  });

  test('timeline entries map to the Wraith, Medium, Exorcist, resolved, autopsy phases', () => {
    const types = [
      'signal.runtime.oom',
      'state.diagnosing',
      'diagnosis',
      'policy',
      'pr.opened',
      'state.resolved',
      'autopsy.written',
    ];
    expect(types.map((type) => phaseOf({ at: '', type, detail: '' }))).toEqual([
      'watcher',
      'diagnoser',
      'diagnoser',
      'fixer',
      'fixer',
      'resolved',
      'postmortem',
    ]);
    expect([
      ...reachedPhases(
        view(
          {},
          {
            timeline: [
              { at: 'a', type: 'signal.x', detail: '' },
              { at: 'b', type: 'diagnosis', detail: '' },
            ],
          },
        ),
      ),
    ]).toEqual(['watcher', 'diagnoser']);
  });

  test('times render in Asia/Ho_Chi_Minh', () => {
    expect(formatTime('2026-11-20T17:30:00.000Z')).toBe('00:30:00, 21 Nov');
  });

  test('property: upsert keeps one row per incident, newest first', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom('a', 'b', 'c'),
            minute: fc.integer({ min: 10, max: 59 }),
          }),
          { maxLength: 20 },
        ),
        (updates) => {
          const list = updates.reduce<IncidentView[]>(
            (acc, u) =>
              upsertIncident(
                acc,
                view({ id: u.id, updatedAt: `2026-11-20T10:${u.minute}:00.000Z` }),
              ),
            [],
          );
          expect(new Set(list.map((v) => v.incident.id)).size).toBe(list.length);
          expect(list.map((v) => v.incident.updatedAt)).toEqual(
            list
              .map((v) => v.incident.updatedAt)
              .toSorted()
              .toReversed(),
          );
          for (const id of new Set(updates.map((u) => u.id))) {
            const last = updates.findLast((u) => u.id === id);
            expect(list.find((v) => v.incident.id === id)?.incident.updatedAt).toBe(
              `2026-11-20T10:${last?.minute}:00.000Z`,
            );
          }
        },
      ),
    );
  });

  test('graveyard patch marks and clears the right grave', () => {
    const graves: Grave[] = [
      { name: 'api', runtime: 'docker', health: 'healthy' },
      { name: 'worker', runtime: 'docker', health: 'healthy' },
    ];
    const opened = patchGraveyard(graves, view());
    expect(opened?.[0]).toMatchObject({
      incidentId: 'inc-1',
      severity: 'critical',
      state: 'diagnosed',
    });
    expect(opened?.[1]).toEqual(graves[1]);
    expect(patchGraveyard(opened, view({ state: 'resolved' }))?.[0]).toEqual(graves[0]);
    expect(patchGraveyard(undefined, view())).toBeUndefined();
  });
});

describe('live updates', () => {
  test('an incident event updates list, detail and graveyard caches synchronously', () => {
    const qc = new QueryClient();
    qc.setQueryData<Grave[]>(keys.graveyard, [
      { name: 'api', runtime: 'docker', health: 'healthy' },
    ]);
    const started = performance.now();
    applyDaemonEvent(qc, { type: 'incident', view: view() });
    expect(performance.now() - started).toBeLessThan(50);
    expect(qc.getQueryData<IncidentView[]>(keys.incidents)?.[0]?.incident.id).toBe('inc-1');
    expect(qc.getQueryData<Grave[]>(keys.graveyard)?.[0]?.incidentId).toBe('inc-1');
  });

  test('timeline events append once to a cached incident', () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.incident('inc-1'), view());
    const entry = { at: '2026-11-20T10:02:00.000Z', type: 'pr.opened', detail: 'https://x/pull/1' };
    applyDaemonEvent(qc, { type: 'timeline', incidentId: 'inc-1', entry });
    applyDaemonEvent(qc, { type: 'timeline', incidentId: 'inc-1', entry });
    expect(qc.getQueryData<IncidentView>(keys.incident('inc-1'))?.timeline).toEqual([entry]);
  });

  test('reconnect backoff doubles from 1 s and caps at 30 s', () => {
    expect([0, 1, 2, 5, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 30_000, 30_000]);
  });
});
