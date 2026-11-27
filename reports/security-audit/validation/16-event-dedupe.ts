// Bounded validation: dedupe key uses envelope.id only, ignoring projectId.
import {
  createEventsConsumer,
  decodeQueuedEvent,
  publishSubject,
} from '/target/packages/events/src/index.ts';

type Any = any;
const LEAD = 'packages/events/src/consumer.ts:projectless-event-dedupe';

const SHARED_ID = 'same-envelope-id';
const processed: Array<{ id: string; projectId: string; type: string }> = [];
const acks: string[] = [];
const terms: string[] = [];
const naks: string[] = [];
const deadLetters: string[] = [];

function envelopeFor(projectId: string, type: string, severity: 'warning' | 'critical'): Any {
  return {
    id: SHARED_ID,
    projectId,
    source: 'collector.docker',
    service: 'checkout',
    type,
    severity,
    observedAt: '2026-11-26T00:00:00.000Z',
    traceId: 'trace-dedupe',
    fingerprint: 'checkout:dedupe',
    payload: { message: 'dummy observation' },
  };
}

function queuedFor(env: Any): Any {
  const data = new TextEncoder().encode(JSON.stringify(env));
  const subject = publishSubject(env);
  // Sanity-check the decode helper is the same one the consumer uses.
  const decoded = decodeQueuedEvent(data, subject);
  if (decoded === null || decoded.id !== SHARED_ID || decoded.projectId !== env.projectId) {
    throw new Error(`decode mismatch for project ${env.projectId}`);
  }
  return {
    data,
    subject,
    term: (reason?: string) => terms.push(`${env.projectId}:${reason ?? ''}`),
    working: () => {},
    nak: (delay?: number) => naks.push(`${env.projectId}:${delay ?? ''}`),
    ackAck: async () => {
      acks.push(env.projectId);
      return true;
    },
  };
}

try {
  const first = envelopeFor('101', 'no-detection', 'warning');
  const second = envelopeFor('202', 'runtime.oom', 'critical');
  const messages = [queuedFor(first), queuedFor(second)];

  const transport: Any = {
    async acquire() {
      return {
        messages: {
          async *[Symbol.asyncIterator]() {
            for (const message of messages) yield message;
          },
          stop() {},
        },
        publisher: {} as Any,
        deadLetter: async (env: Any, reason: string) => {
          deadLetters.push(`${env.projectId}:${reason}`);
        },
        close: async () => {},
      };
    },
  };

  const consumer = await createEventsConsumer({
    transport,
    grantedProjectIds: ['101', '202'],
  });
  await consumer.run(async (env: Any) => {
    processed.push({ id: env.id, projectId: env.projectId, type: env.type });
  });
  await consumer.stop();

  const firstAcked = acks.includes('101');
  const secondAcked = acks.includes('202');
  const secondProcessed = processed.some((entry) => entry.projectId === '202');
  const confirmed = firstAcked && secondAcked && !secondProcessed && processed.length === 1;

  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: confirmed ? 'confirmed' : 'rejected',
      observed: {
        sharedId: SHARED_ID,
        grantedProjectIds: ['101', '202'],
        decodedProjects: messages.map((_m, index) => (index === 0 ? '101' : '202')),
        firstType: 'no-detection',
        secondType: 'runtime.oom',
        processedCount: processed.length,
        processed,
        acks,
        terms,
        naks,
        deadLetters,
        firstAcked,
        secondAcked,
        secondProcessed,
      },
      reason: confirmed
        ? 'Dedupe is keyed on envelope.id alone: project 202 reused id "same-envelope-id", was acknowledged on the dedupe branch, and never reached the process callback (which would have produced runtime.oom).'
        : 'Expected projectless dedupe signature was not observed; second envelope was not silently acked without processing.',
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error) },
      reason: 'Harness threw before the dedupe boundary could be observed.',
    }),
  );
}
