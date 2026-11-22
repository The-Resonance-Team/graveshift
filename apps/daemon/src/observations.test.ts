import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import type { Gateway } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { fakeApi } from './fake-api';
import { agent, caller, envelope, item } from './flow-fixtures';
import { createObservations, type ObservationOptions } from './observations';
import { HttpFailure } from './private-http';
import { harness } from './flow-harness';
import { workActivation } from './work-activation';
import { processQueued } from './nats';
import { publishSubject } from '@graveshift/events';

function state() {
  const views = new Map<string, RecordedHaunting>();
  const receipts = new Map<string, string>();
  const work = new Set<string>();
  const activated: string[] = [];
  let modelCalls = 0;
  let loseDiagnosisAck = false;
  let rejectFirstWrite = false;
  const gateway: Pick<Gateway, 'run'> = {
    async run(task) {
      modelCalls++;
      return {
        status: 'ok',
        value: task.schema.parse({
          category: 'resource_exhaustion',
          rootCause: 'Out of memory',
          confidence: 0.95,
          evidence: [{ ref: 'signal:1', excerpt: 'runtime.oom' }],
        }),
        model: 'recorded-model',
        usage: { in: 10, out: 5 },
        costUsd: 0.01,
        callId: 'diagnosis-call',
      };
    },
  };
  const api = fakeApi((path, body) => {
    if (path === '/internal/hauntings/list') return [...views.values()].reverse().slice(0, 50);
    if (path === '/internal/hauntings/active') {
      const ref = z.object({ projectId: z.string(), service: z.string() }).parse(body);
      return (
        [...views.values()].find(
          (view) =>
            view.incident.service === ref.service &&
            !['resolved', 'dismissed'].includes(view.incident.state),
        ) ?? null
      );
    }
    if (path === '/internal/hauntings/get') {
      const ref = z.object({ id: z.string(), projectId: z.string() }).parse(body);
      const found = views.get(ref.id);
      if (!found) throw new HttpFailure(404, 'Not found');
      return found;
    }
    if (path === '/internal/hauntings') {
      const input = z
        .object({ projectId: z.string(), eventId: z.string(), view: RecordedHauntingSchema })
        .parse(body);
      if (rejectFirstWrite) {
        rejectFirstWrite = false;
        throw new Error('Storage unavailable');
      }
      const previous = receipts.get(input.eventId);
      const serialized = JSON.stringify(input.view);
      if (previous !== undefined && previous !== serialized)
        throw new Error('Changed idempotency payload');
      receipts.set(input.eventId, serialized);
      views.set(input.view.incident.id, input.view);
      if (loseDiagnosisAck && input.view.incident.diagnosis) {
        loseDiagnosisAck = false;
        throw new Error('Durable write committed but response was lost');
      }
      return input.view;
    }
    if (path === '/internal/work-items/from-haunting') {
      const ref = z.object({ incidentId: z.string() }).parse(body);
      const created = !work.has(ref.incidentId);
      work.add(ref.incidentId);
      return { item: item(), created };
    }
    throw new Error('Unexpected API call');
  });
  const options: ObservationOptions = {
    projectId: caller.projectId,
    api,
    gateway,
    agents: [agent({ role: 'diagnosis' })],
    logs: async () => ['Out of memory'],
    onWork: async (_item, incidentId) => {
      activated.push(incidentId);
    },
  };
  return {
    options,
    views,
    work,
    activated,
    receipts,
    modelCalls: () => modelCalls,
    loseAck: () => {
      loseDiagnosisAck = true;
    },
    failWrite: () => {
      rejectFirstWrite = true;
    },
  };
}

describe('queued observation orchestration', () => {
  test('a queued detection persists its Haunting, Diagnosis, and one Work item', async () => {
    const fixture = state();
    const process = await createObservations(fixture.options);
    await process(envelope);
    const view = [...fixture.views.values()][0];
    if (view === undefined) throw new Error('Expected a recorded Haunting');
    expect(view).toMatchObject({
      category: 'resource_exhaustion',
      incident: { service: 'checkout', state: 'diagnosed' },
      detections: [
        { projectId: caller.projectId, eventId: envelope.id, traceId: envelope.traceId },
      ],
    });
    expect(view?.incident.diagnosis?.incidentId).toBe(view?.incident.id);
    expect(fixture.work.size).toBe(1);
    expect(fixture.activated).toEqual([view?.incident.id]);
    expect(fixture.modelCalls()).toBe(1);
    await process(envelope);
    const restarted = await createObservations(fixture.options);
    await restarted(envelope);
    expect(fixture.modelCalls()).toBe(1);
    expect(fixture.work.size).toBe(1);
  });

  test('a failed durable write retains the accepted outcome for redelivery', async () => {
    const fixture = state();
    const process = await createObservations(fixture.options);
    fixture.failWrite();
    await expect(process(envelope)).rejects.toThrow('Storage unavailable');
    expect(fixture.modelCalls()).toBe(0);
    await process(envelope);
    expect(fixture.work.size).toBe(1);
    expect(fixture.modelCalls()).toBe(1);
  });

  test('a lost Diagnosis response is reconciled before another model call', async () => {
    const fixture = state();
    fixture.loseAck();
    const process = await createObservations(fixture.options);
    await expect(process(envelope)).rejects.toThrow('response was lost');
    await process(envelope);
    expect(fixture.work.size).toBe(1);
    expect(fixture.modelCalls()).toBe(1);
    expect(fixture.receipts.size).toBe(2);
  });

  test('foreign projects fail and crew output cannot re-enter detection', async () => {
    const fixture = state();
    const process = await createObservations(fixture.options);
    await expect(process({ ...envelope, projectId: 'foreign' })).rejects.toThrow('another project');
    await process({ ...envelope, id: 'crew-output', type: 'diagnosis.ready' });
    expect(fixture.work.size).toBe(0);
    expect(fixture.views.size).toBe(0);
    expect(fixture.modelCalls()).toBe(0);
  });

  test('a queued Haunting activates its Agent assignment before acknowledgement', async () => {
    const fixture = state();
    const flow = harness([agent({ autoFix: true })]);
    const entered = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<void>();
    const execute = flow.options.execute;
    flow.options.execute = async (input) => {
      entered.resolve();
      await completed.promise;
      return execute(input);
    };
    fixture.options.onWork = workActivation(flow.commands(), caller.projectId);
    const process = await createObservations(fixture.options);
    const acknowledgements: string[] = [];
    const queued = processQueued(
      {
        data: new TextEncoder().encode(JSON.stringify(envelope)),
        subject: publishSubject(envelope),
        term: () => acknowledgements.push('term'),
        working: () => {},
        nak: () => acknowledgements.push('nak'),
        ackAck: async () => {
          acknowledgements.push('ack');
          return true;
        },
      },
      caller.projectId,
      process,
    );
    await entered.promise;
    expect(acknowledgements).toEqual([]);
    completed.resolve();
    await queued;
    expect(acknowledgements).toEqual(['ack']);
    expect(flow.runtime.snapshot.item.draftPr?.number).toBe(7);
    expect(flow.requests).toHaveLength(1);
  });

  test('a restart finds an active Grave beyond the default fifty-row history page', async () => {
    const fixture = state();
    await (
      await createObservations(fixture.options)
    )(envelope);
    const original = [...fixture.views.values()][0];
    if (original === undefined) throw new Error('Expected a recorded Haunting');
    for (let index = 0; index < 51; index++) {
      const other = structuredClone(original);
      other.incident.id = `other-${index}`;
      other.incident.service = `other-${index}`;
      if (other.incident.diagnosis) other.incident.diagnosis.incidentId = other.incident.id;
      other.detections = other.detections.map((entry) => ({
        ...entry,
        service: other.incident.service,
      }));
      fixture.views.set(other.incident.id, other);
    }
    const restarted = await createObservations(fixture.options);
    await restarted({ ...envelope, id: 'second-observation' });
    expect(fixture.views.size).toBe(52);
    expect(
      [...fixture.views.values()].filter((view) => view.incident.service === envelope.service),
    ).toHaveLength(1);
    expect(fixture.work.size).toBe(1);
    expect(fixture.modelCalls()).toBe(1);
  });

  test('a persisted closed Haunting releases the old in-memory group for the next observation', async () => {
    const fixture = state();
    const process = await createObservations(fixture.options);
    await process(envelope);
    const original = [...fixture.views.values()][0];
    if (original === undefined) throw new Error('Expected a recorded Haunting');
    fixture.views.set(original.incident.id, {
      ...original,
      incident: { ...original.incident, state: 'resolved' },
    });
    await process({ ...envelope, id: 'new-haunting', observedAt: '2026-11-21T10:11:00.000Z' });
    expect(fixture.views.size).toBe(2);
    expect(fixture.work.size).toBe(2);
  });
});
