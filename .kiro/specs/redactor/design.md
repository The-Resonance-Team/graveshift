# Redactor — Design

## Interfaces
- `redact(text: string): string` — pure.
- `Detector = { type: string; pattern: RegExp; replacement: string }`.
- Detector registry ordered by specificity; output markers use `[REDACTED:<type>]`.

## Data flow
1. Run regex detectors over the input, replacing matches with typed markers.
2. Run the entropy detector on remaining token-like strings.
3. Return the transformed string. No logging of originals.

## Error handling
- Invalid input type → coerce to empty string; never throw into a logging path.

## Testing
- fast-check: for any string with an injected secret, output never contains the secret; `redact(redact(s)) === redact(s)`.
- Microbenchmark for the 1 KB / 1 ms budget.
