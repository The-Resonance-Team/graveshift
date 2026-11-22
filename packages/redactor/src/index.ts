import { DETECTORS } from './detectors';

const MAX_PASSES = 4;

/** Recognized secrets and personal data, without the free-text entropy heuristic. */
export function hasSensitiveText(text: string): boolean {
  return DETECTORS.some(({ type, pattern }) => type !== 'entropy' && text.search(pattern) !== -1);
}

function pass(text: string): string {
  let out = text;
  for (const { pattern, replacement } of DETECTORS) {
    out =
      typeof replacement === 'string'
        ? out.replace(pattern, replacement)
        : out.replace(pattern, replacement);
  }
  return out;
}

// A marker can create a word boundary that lets a neighbouring secret match on the next pass,
// so repeat until stable; this is what makes redact(redact(s)) === redact(s).
export function redact(text: string): string {
  if (typeof text !== 'string') return '';
  let out = text;
  for (let i = 0; i < MAX_PASSES; i++) {
    const next = pass(out);
    if (next === out) break;
    out = next;
  }
  return out;
}
