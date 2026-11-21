# Real-model diagnosis report (2026-11-20)

Result: all three diagnoser fixtures pass against the real model after one prompt change (round 2). The Compose demo also produced an `llm` diagnosis for the injected `null-candy` haunt.

This report records a past run. [ADR 0009](../adr/0009-remove-v1-daemon-and-diagnosis-model-path.md) removed the harness and its daemon. The current diagnosis tests replay recorded output without a model connection.

## Method

- The harness called the public diagnosis function with an OpenAI-compatible model. It used `qwen3.8-flash-next`, a 30 s timeout and one transport retry.
- Inputs: the `input` field of `packages/diagnoser/fixtures/{null-candy,memory-leech,wrong-potion}.json`. `llmResponse` is ignored.
- Expected categories: `null-candy` is `code_bug`, `memory-leech` is `resource_exhaustion`, `wrong-potion` is `config_error`.
- A case passes only when all of these hold: category matches, every evidence ref exists in the context bundle, and no secret appears in the output. The source is recorded as `usedLlm` but is not a pass condition.
- Rounds: round 0 is the baseline with no providers (rules-only). Round 1 is the real model with the unmodified prompt. Round 2 is the real model after one prompt change.
- Raw results: `docs/reports/real-model-results.jsonl`. Rows hold short redacted excerpts only, no prompts and no full logs.
- Not changed: diagnosis logic, schema, validation, model, temperature.

## Baseline and rounds

| Round | Mode | Case | Expected | Actual | Conf. | Source | Grounded | Leak | Latency | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | rules-only | null-candy | code_bug | code_bug | 0.75 | rules-only | yes | no | 1 ms | yes |
| 0 | rules-only | memory-leech | resource_exhaustion | resource_exhaustion | 0.80 | rules-only | yes | no | 0 ms | yes |
| 0 | rules-only | wrong-potion | config_error | config_error | 0.70 | rules-only | yes | no | 0 ms | yes |
| 1 | llm, initial prompt | null-candy | code_bug | code_bug | 0.95 | llm | yes | no | 8,936 ms | yes |
| 1 | llm, initial prompt | memory-leech | resource_exhaustion | **deploy_regression** | 0.85 | llm | yes | no | 21,194 ms | **no** |
| 1 | llm, initial prompt | wrong-potion | config_error | config_error | 0.92 | llm | yes | no | 56,870 ms | yes |
| 2 | llm, tuned prompt | null-candy | code_bug | code_bug | 0.96 | llm | yes | no | 35,049 ms | yes |
| 2 | llm, tuned prompt | memory-leech | resource_exhaustion | resource_exhaustion | 0.95 | llm | yes | no | 5,919 ms | yes |
| 2 | llm, tuned prompt | wrong-potion | config_error | config_error | 0.93 | llm | yes | no | 6,516 ms | yes |

Stop condition met after round 2. The cap allows three rounds after the baseline (rounds 1-3); round 3 was not needed.

## Failure analysis

Round 1, `memory-leech`: the model chose `deploy_regression` with confidence 0.85. Its evidence was grounded: the OOM and restart-loop signals, `file:src/worker.ts` (`retained.push(Buffer.alloc(...))`) and `commit:b2c3d4e` ("feat: retain job buffers for debugging"). The facts were right but the category was wrong. The system prompt listed the five category names without defining them, so a recent commit that caused an OOM looked like a deploy regression to the model.

Round 2 prompt change (one added line in `SYSTEM_PROMPT`, `packages/diagnoser/src/context.ts`):

> Pick the category by the failure mechanism: resource_exhaustion when memory, CPU, disk or connections run out (OOM kills, restart loops), even if a recent commit caused it; code_bug for a defect in the code itself; config_error for wrong settings or environment values; deploy_regression only when a release broke behavior and no more specific mechanism fits.

Effect: `memory-leech` became `resource_exhaustion` (0.95). The other two cases stayed correct.

`supportsStructuredOutputs`: not changed. The model never returned output that failed the zod schema, so the correctness-fix exception did not apply. The SDK still warns that `responseFormat` is not sent. The prompt asks for a JSON object and the gateway validates it.

## Post-review fixes

After review, the gateway used rules-only when output stayed invalid after one validation retry. The three fixtures were not sent to the live model again. Gateway and diagnoser tests checked the fallback.

## Compose evidence

The local stack used `graveshift.compose.yml` and `demo.compose.yml`. About 80 requests to `/candies/1` and `/candies/2` triggered `null-candy`. The model reported `code_bug` at 93% confidence and cited `log:1`, `log:2` and `log:3`. The audit check reported four entries and no break in the chain. `docker compose down` removed the containers and networks.

## Limitations

- One run per round. Temperature is 0, but the provider may still vary; this is a sample of three fixtures, not a benchmark.
- The prompt change was written after seeing one failure. It generalises the category definitions, but the fixtures are the only check.
- Latency varies widely (5.9 s to 56.9 s). Some values exceed the 30 s `timeoutMs`, so those calls likely included a gateway retry. The latency column is wall time for the whole `diagnose` call.
- The secret check relies on the redactor patterns plus the live credential values. The fixtures hold no secrets, so a leak was not exercised here. Redaction before the LLM is covered by the redactor and gateway tests.
- The Compose run covered `null-candy` only. `memory-leech` and `wrong-potion` were not injected in Compose.
- A first Compose attempt used a stale named Postgres volume with an older password, so the API was unhealthy. The volumes were recreated before the recorded run.
- The live run used a private model endpoint.

## Current offline check

```sh
bun test --check packages/diagnoser packages/gateway
```
