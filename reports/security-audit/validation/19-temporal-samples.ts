// Bounded validation: log.error-burst temporal samples grow unbounded and rescan via filter().
import { createRules } from '/target/packages/watcher/src/rules.ts';

type Any = any;
const LEAD = 'packages/watcher/src/rules.ts:unbounded-temporal-samples';
const AT = '2026-11-26T00:00:00.000Z';

const originalFilter = Array.prototype.filter;
let visits = 0;
let batches: number[] = [];
let instrumented = false;

function startInstrument(): void {
  visits = 0;
  batches = [];
  (Array.prototype as Any).filter = function (this: Any, callback: Any, thisArg?: Any) {
    const before = visits;
    const wrapped = (element: Any, index: number, array: Any[]) => {
      visits += 1;
      return callback.call(thisArg, element, index, array);
    };
    const result = originalFilter.call(this, wrapped, thisArg);
    batches.push(visits - before);
    return result;
  };
  instrumented = true;
}

function stopInstrument(): void {
  (Array.prototype as Any).filter = originalFilter;
  instrumented = false;
}

function errorLineEnvelope(index: number): Any {
  return {
    id: `error-line-${index}`,
    projectId: 'p1',
    source: 'collector.docker',
    service: 'checkout',
    type: 'log.line',
    severity: 'warning',
    observedAt: AT, // all samples share the same observation time
    traceId: 'trace-temporal',
    fingerprint: 'checkout:log.line',
    payload: { line: 'ERROR: dummy failure in checkout' },
  };
}

function run(count: number): Any {
  const rules = createRules();
  let detections = 0;
  startInstrument();
  try {
    for (let index = 0; index < count; index += 1) {
      detections += rules(errorLineEnvelope(index)).length;
    }
  } finally {
    stopInstrument();
  }
  // Each filter call visits the currently-retained sample count; after the
  // final append the retained sample count is (last batch + 1).
  const retainedSamples = batches.length > 0 ? batches[batches.length - 1]! + 1 : 0;
  return {
    count,
    visits,
    expectedVisits: (count * (count - 1)) / 2,
    filterCalls: batches.length,
    batches,
    retainedSamples,
    detections,
  };
}

try {
  const small = run(8);
  const large = run(16);
  const visitRatio = large.visits / small.visits;
  const quadratic =
    small.visits === small.expectedVisits &&
    large.visits === large.expectedVisits &&
    large.retainedSamples === 16 &&
    small.retainedSamples === 8;

  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: quadratic && visitRatio > 3.5 ? 'confirmed' : 'rejected',
      observed: {
        observedAt: AT,
        line: 'ERROR: dummy failure in checkout',
        small,
        large,
        visitRatio: Number(visitRatio.toFixed(3)),
        expectedQuadraticRatio: 4,
        noCountCap: quadratic,
        instrumentationRestored: !instrumented,
      },
      reason: quadratic
        ? `Doubling unique error lines from 8 to 16 grew filter callback visits ${visitRatio.toFixed(2)}x (quadratic n(n-1)/2), and all samples were retained (8 -> 16) with no eviction cap on the error array.`
        : 'Expected quadratic visit growth / unbounded retention was not observed.',
    }),
  );
} catch (error) {
  if (instrumented) stopInstrument();
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error) },
      reason: 'Harness threw before the temporal-sample boundary could be observed.',
    }),
  );
}
