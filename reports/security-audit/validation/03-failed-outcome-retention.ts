// Bounded validation: a permanently failing write retains its pending outcome forever.
import { createObservations } from '/target/apps/daemon/src/observations.ts';
import { HttpFailure } from '/target/apps/daemon/src/private-http.ts';

type Any = any;
const LEAD = 'apps/daemon/src/observations.ts:failed-outcome-retention';
const BASE = Date.parse('2026-11-26T00:00:00.000Z');
const STEP_MS = 11 * 60 * 1000; // beyond WINDOWS.dedupeMs so each ingest is accepted
const MAX_EVENT_ID = 180; // real DTO limit enforced by the fake PrivateApi

// 180-character ids: the write eventId is `${id}:detected:runtime.oom` (201 chars),
// which the fake API rejects, simulating a permanent durable-write failure.
const ids = [1, 2, 3].map((digit) => 'a'.repeat(179) + String(digit));
const tracked = new Set(ids);
const setKeys: string[] = [];
const deleteKeys: string[] = [];

const originalSet = Map.prototype.set;
const originalDelete = Map.prototype.delete;

let activeCalls = 0;
let getCalls = 0;
let writeAttempts = 0;
let rejectedWrites = 0;
let workCalls = 0;
let gatewayCalls = 0;
const writeEventIdLengths: number[] = [];

const api: Any = {
  get: async () => {
    throw new Error('unexpected GET on fake PrivateApi');
  },
  post: async (path: string, body: Any, schema: Any) => {
    if (path === '/internal/hauntings/active') {
      activeCalls += 1;
      return schema.parse(null); // no active Haunting
    }
    if (path === '/internal/hauntings/get') {
      getCalls += 1;
      throw new HttpFailure(404, 'not found');
    }
    if (path === '/internal/hauntings') {
      writeAttempts += 1;
      const eventId: unknown = body?.eventId;
      writeEventIdLengths.push(typeof eventId === 'string' ? eventId.length : -1);
      if (typeof eventId === 'string' && eventId.length > MAX_EVENT_ID) {
        rejectedWrites += 1;
        throw new Error(`DTO limit exceeded: eventId must be <= ${MAX_EVENT_ID} chars`);
      }
      return schema.parse(body?.view);
    }
    if (path === '/internal/work-items/from-haunting') {
      workCalls += 1;
      return schema.parse({ item: { id: 'dummy-work-item' }, created: true });
    }
    throw new Error(`unexpected POST on fake PrivateApi: ${path}`);
  },
};

const gateway: Any = {
  run: async () => {
    gatewayCalls += 1;
    throw new Error('gateway must not be called in this harness');
  },
};
const agents: Any = [{ role: 'diagnosis', name: 'dummy-diagnosis-agent' }];

function eventFor(id: string, step: number): Any {
  return {
    id,
    projectId: 'p1',
    source: 'collector.docker',
    service: 'checkout',
    type: 'runtime.oom',
    severity: 'critical',
    observedAt: new Date(BASE + step * STEP_MS).toISOString(),
    traceId: 'trace-retention',
    fingerprint: 'checkout:oom',
    payload: { message: 'dummy out of memory' },
  };
}

function restore(): void {
  Map.prototype.set = originalSet;
  Map.prototype.delete = originalDelete;
}

try {
  // Inspection hook: observe set/delete of the internal `pending` Map by its
  // distinctive 180-character event-id keys, without altering target source.
  Map.prototype.set = function (this: Any, key: Any, value: Any) {
    if (typeof key === 'string' && tracked.has(key)) setKeys.push(key);
    return originalSet.call(this, key, value);
  };
  Map.prototype.delete = function (this: Any, key: Any) {
    if (typeof key === 'string' && tracked.has(key)) deleteKeys.push(key);
    return originalDelete.call(this, key);
  };

  const observe = await createObservations({
    api,
    gateway,
    agents,
    logs: async () => [],
    onWork: async () => {},
  });

  // Three unique failing ids, then a retry of each (11 minutes apart) to
  // exercise the retained-outcome short-circuit at pending.get(event.id).
  const feeds = [
    { idIndex: 0, step: 0, retry: false },
    { idIndex: 1, step: 1, retry: false },
    { idIndex: 2, step: 2, retry: false },
    { idIndex: 0, step: 3, retry: true },
    { idIndex: 1, step: 4, retry: true },
    { idIndex: 2, step: 5, retry: true },
  ];
  const failureMessages: string[] = [];
  for (const feed of feeds) {
    try {
      await observe(eventFor(ids[feed.idIndex]!, feed.step));
    } catch (error) {
      failureMessages.push(error instanceof Error ? error.message : String(error));
    }
  }
  restore();

  const retainedIds = ids.filter(
    (id) => setKeys.filter((key) => key === id).length > deleteKeys.filter((key) => key === id).length,
  );
  const retainedCount = retainedIds.length;
  const activeCallsOnRetries = activeCalls - 3; // three unique first-time ingests
  const confirmed =
    retainedCount === 3 &&
    deleteKeys.length === 0 &&
    activeCalls === 3 &&
    activeCallsOnRetries === 0 &&
    writeAttempts === 6 &&
    workCalls === 0 &&
    gatewayCalls === 0;

  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: confirmed ? 'confirmed' : 'rejected',
      observed: {
        eventIdLength: ids[0]!.length,
        writeEventIdLengths,
        dtoLimit: MAX_EVENT_ID,
        feedCount: feeds.length,
        failedFeeds: failureMessages.length,
        failureMessages: [...new Set(failureMessages)],
        pendingSets: setKeys.length,
        pendingDeletes: deleteKeys.length,
        retainedPendingOutcomes: retainedCount,
        activeCalls,
        activeCallsOnRetries,
        getCalls,
        writeAttempts,
        rejectedWrites,
        workCalls,
        gatewayCalls,
        inspectionHook: 'instrumented Map.prototype.set/delete keyed by the 180-char event ids',
      },
      reason: confirmed
        ? 'Every permanently failed outcome stayed in pending: three unique ids produced three sets and zero deletes; the three retries skipped the active lookup (retained-outcome path) and re-attempted the write, so retention grows linearly with failures with no eviction.'
        : 'Expected failed-outcome retention signature was not observed; see counters above.',
    }),
  );
} catch (error) {
  restore();
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error) },
      reason: 'Harness threw before the failed-outcome retention boundary could be observed.',
    }),
  );
}
