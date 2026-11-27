// Bounded validation: a permanently-failing head record starves the healthy tail forever.
import { createDeliveryQueue } from '/target/packages/integrations/src/delivery.ts';

type Any = any;
const LEAD = 'packages/integrations/src/delivery.ts:permanent-collector-poison-retry';
const LIMIT = 5; // stop after a few retries

const published: string[] = [];
const sleepDelays: number[] = [];
let poisonDeliverCalls = 0;
let healthyDeliverCalls = 0;
let acknowledgeCalls = 0;

const publisher: Any = {
  async publish(envelope: Any) {
    published.push(envelope?.id ?? 'unknown');
  },
};

// Fixed small backoff: resolve immediately for the first LIMIT-1 calls, then
// throw to abort the retry loop at the cap (no timers, no spinning).
const sleep = async (ms: number, _signal: AbortSignal): Promise<void> => {
  sleepDelays.push(ms);
  if (sleepDelays.length >= LIMIT) throw new Error('harness retry limit reached');
  return;
};

const poison: Any = {
  key: 'poison-record',
  async deliver() {
    poisonDeliverCalls += 1;
    throw new Error('deterministic validation error: poison native record');
  },
  acknowledge() {
    acknowledgeCalls += 1;
  },
};

const healthy: Any = {
  key: 'healthy-record',
  async deliver(send: Any) {
    healthyDeliverCalls += 1;
    await send({ id: 'healthy-envelope' });
  },
  acknowledge() {
    acknowledgeCalls += 1;
  },
};

try {
  const queue = createDeliveryQueue(publisher, sleep);
  const poisonAccepted = queue.enqueue(poison);
  const healthyAccepted = queue.enqueue(healthy);

  // Let all microtask-based retry work settle; the worker self-aborts when sleep throws.
  for (let i = 0; i < 20 && sleepDelays.length < LIMIT; i += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const starved = published.length === 0 && healthyDeliverCalls === 0;
  const confirmed = poisonAccepted && healthyAccepted && poisonDeliverCalls >= LIMIT && starved;

  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: confirmed ? 'confirmed' : 'rejected',
      observed: {
        retryLimit: LIMIT,
        poisonAccepted,
        healthyAccepted,
        poisonDeliverCalls,
        healthyDeliverCalls,
        published,
        publishedCount: published.length,
        acknowledgeCalls,
        sleepDelays,
        sleepDelayMsIgnored: true,
      },
      reason: confirmed
        ? 'The retry loop has no attempt cap: the head record threw on every delivery, so entries() kept yielding pending[0]; the healthy record never reached deliver() and the publisher received nothing.'
        : 'Expected permanent-poison starvation was not observed; check the counters above.',
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error) },
      reason: 'Harness threw before the retry boundary could be observed.',
    }),
  );
}
