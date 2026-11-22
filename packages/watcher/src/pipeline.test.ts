import { expect, test } from 'bun:test';
import fc from 'fast-check';

import { at, harness, signal } from './test-helpers';

const sequence = fc
  .array(
    fc.record({
      projectId: fc.constantFrom('project-1', 'project-2'),
      service: fc.constantFrom('api', 'worker', 'db'),
      seconds: fc.integer({ min: 0, max: 5000 }),
    }),
    { maxLength: 40 },
  )
  .map((items) => items.sort((a, b) => a.seconds - b.seconds));

test('public ingest keeps one Haunting per project and Grave and attaches each accepted detection once', () => {
  fc.assert(
    fc.property(sequence, (items) => {
      const captured = harness();
      for (const item of items)
        captured.watcher.ingest(signal('oom', item.seconds, item.service, item.projectId));
      const open = captured.watcher.openIncidents();
      const keys = open.map((entry) => JSON.stringify([entry.projectId, entry.incident.service]));
      expect(new Set(keys).size).toBe(keys.length);
      const attached = open.flatMap((entry) => entry.incident.signalIds);
      expect(new Set(attached).size).toBe(attached.length);
      expect(attached).toHaveLength(captured.accepted().length);
    }),
  );
});

test('accepted fingerprints are spaced by the dedupe window within each project and Grave', () => {
  fc.assert(
    fc.property(sequence, (items) => {
      const captured = harness();
      for (const item of items)
        captured.watcher.ingest(signal('oom', item.seconds, item.service, item.projectId));
      const groups = Map.groupBy(captured.accepted(), (outcome) =>
        JSON.stringify([
          outcome.detection.projectId,
          outcome.detection.service,
          outcome.detection.fingerprint,
        ]),
      );
      for (const group of groups.values()) {
        for (let index = 1; index < group.length; index += 1) {
          expect(
            Date.parse(group[index]!.detection.observedAt) -
              Date.parse(group[index - 1]!.detection.observedAt),
          ).toBeGreaterThanOrEqual(600_000);
        }
      }
    }),
  );
});

test('Salt line detections never open a Haunting for the selected project and Grave', () => {
  fc.assert(
    fc.property(sequence, (items) => {
      const captured = harness();
      captured.watcher.silence({
        projectId: 'project-1',
        service: 'api',
        from: at(0),
        until: at(10_000),
      });
      for (const item of items)
        captured.watcher.ingest(signal('oom', item.seconds, item.service, item.projectId));
      expect(
        captured.watcher
          .openIncidents()
          .some((entry) => entry.projectId === 'project-1' && entry.incident.service === 'api'),
      ).toBe(false);
    }),
  );
});
