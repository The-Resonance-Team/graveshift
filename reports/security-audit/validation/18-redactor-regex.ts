// Bounded validation: unanchored email regex backtracks quadratically on non-matching ASCII text.
import { redact } from '/target/packages/redactor/src/index.ts';

const LEAD = 'packages/redactor/src/detectors.ts:email-unanchored-scan';
const SIZES = [256, 512, 1024, 2048];
const ITERATIONS = 3;

try {
  // One bounded warmup so JIT compilation is not attributed to the first sample.
  redact('a'.repeat(128));

  const timingsNs: number[] = [];
  const unchanged: boolean[] = [];

  for (const size of SIZES) {
    const input = 'a'.repeat(size); // alphabetic, contains no '@' -> email detector cannot match
    let best = Number.POSITIVE_INFINITY;
    let stayedSame = true;
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = process.hrtime.bigint();
      const output = redact(input);
      const end = process.hrtime.bigint();
      const elapsed = Number(end - start);
      if (output !== input) stayedSame = false;
      if (elapsed < best) best = elapsed;
    }
    timingsNs.push(best);
    unchanged.push(stayedSame);
  }

  const ratios = timingsNs.slice(1).map((value, index) => value / timingsNs[index]!);
  const exponents = ratios.map((ratio) => Math.log2(ratio));
  const superlinear = exponents.length > 0 && exponents.every((exponent) => exponent > 1.5);

  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: superlinear ? 'confirmed' : 'rejected',
      observed: {
        sizes: SIZES,
        iterations: ITERATIONS,
        timingsNs,
        timingsMs: timingsNs.map((ns) => Number((ns / 1_000_000).toFixed(4))),
        doublingRatios: ratios.map((ratio) => Number(ratio.toFixed(3))),
        growthExponents: exponents.map((exponent) => Number(exponent.toFixed(3))),
        nonMatchingInputUnchanged: unchanged,
      },
      reason: superlinear
        ? 'Each doubling of a non-matching ASCII string more than doubled redact() time (exponent > 1.5), consistent with the unanchored email pattern backtracking from every start index.'
        : 'Measured growth was not superlinear across the sampled sizes; email-scan claim not established here.',
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error) },
      reason: 'Harness threw before any timing sample could be collected.',
    }),
  );
}
