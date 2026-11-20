# Real-model diagnosis report (2026-11-20)

Result: all three diagnoser fixtures pass against the real model after one prompt change (round 2). The Compose demo also produced an `llm` diagnosis for the injected `null-candy` haunt.

## Method

- Seam: the public `diagnose({ gateway }, input)` call in `packages/diagnoser`. No internals are mocked.
- Harness: `apps/daemon/scripts/diagnose-real-model.ts`. It sits in `apps/daemon` because that package already resolves every `@graveshift/*` workspace dependency through its exports.
- Gateway: built as the daemon does (`buildProviders`, `createGateway`, daily budget from `policy.example.yaml`, audit callback). LLM settings come from `graveshift.config.example.yaml` (provider `openai-compatible`, model `qwen3.8-flash-next`, `timeoutMs` 30000, `maxRetries` 1). The API key comes from the gitignored `.env`.
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

After the two review reports, the gateway now uses rules-only when model output stays invalid after the one validation retry. This matches ADR 0002 and the spec. The unused `Tier` type and field were removed. The harness no longer has inline lint disables; a scoped override in `.oxlintrc.json` covers its intentional sequential loop. Gateway wiring was moved to one shared factory, `apps/daemon/src/llm.ts`, used by both the daemon and the harness. The three fixtures were not called again after these changes; gateway and diagnoser tests cover the new fallback.

## Compose evidence

Stack: `graveshift.compose.yml` plus `demo.compose.yml`, built locally, with ports bound to `127.0.0.1` (demo API 2600, daemon 2602). Change made: `deploy/compose/graveshift.compose.yml` now passes `OPENAI_COMPATIBLE_API_KEY` to the daemon container; it was missing. `POSTGRES_PASSWORD`, `OWNER_TOKEN` and `ACTUATOR_HMAC_SECRET` were random values created in the shell for the run. Compose was started with `--env-file .env`.

Steps and output (secrets omitted):

1. `curl localhost:2602/healthz` returned `{"status":"ok"}`.
2. `POST localhost:2602/api/haunt` with body `{"scenario":"null-candy"}` returned HTTP 202. I then sent about 80 requests to `/candies/1` and `/candies/2` on port 2600 to trigger the fault.
3. `GET localhost:2602/api/incidents` showed the incident in state `diagnosed`. The timeline entry read `code_bug (93%, llm): The API code calls candy.price.toFixed without validating that candy.price is non-null, causing a TypeError when price is null.` The evidence refs were `log:1`, `log:2` and `log:3`.
4. The daemon log line: `llm: {task: diagnose, status: ok, provider: openai-compatible, model: qwen3.8-flash-next, tokensIn: 804, tokensOut: 245, costUsd: 0}`.
5. `GET /api/audit/verify` returned `{"ok":true,"length":4}`.
6. `docker compose down` removed the containers and networks. No graveshift containers remained.

## Limitations

- One run per round. Temperature is 0, but the provider may still vary; this is a sample of three fixtures, not a benchmark.
- The prompt change was written after seeing one failure. It generalises the category definitions, but the fixtures are the only check.
- Latency varies widely (5.9 s to 56.9 s). Some values exceed the 30 s `timeoutMs`, so those calls likely included a gateway retry. The latency column is wall time for the whole `diagnose` call.
- The secret check relies on the redactor patterns plus the live credential values. The fixtures hold no secrets, so a leak was not exercised here. Redaction before the LLM is covered by the redactor and gateway tests.
- The Compose run covered `null-candy` only. `memory-leech` and `wrong-potion` were not injected in Compose.
- A first Compose attempt used a stale named Postgres volume with an older password, so the API was unhealthy. The volumes were recreated before the recorded run.
- The model endpoint is a private address from `graveshift.config.example.yaml`, so the run reproduces only on a machine that can reach it.

## Reproduce

```sh
# .env (gitignored) must define OPENAI_COMPATIBLE_API_KEY and HAUNT_TOKEN
bun apps/daemon/scripts/diagnose-real-model.ts --baseline --round 0 --label rules-only-baseline
bun apps/daemon/scripts/diagnose-real-model.ts --round 1 --label initial-prompt
# edit SYSTEM_PROMPT, then
bun apps/daemon/scripts/diagnose-real-model.ts --round 2 --label prompt-category-mechanism
```

Each run appends to `docs/reports/real-model-results.jsonl` and exits non-zero if any case fails. To rerun round 1, check out the prompt from before this change.

Compose:

```sh
export POSTGRES_PASSWORD=$(openssl rand -hex 12) OWNER_TOKEN=$(openssl rand -hex 12) ACTUATOR_HMAC_SECRET=$(openssl rand -hex 32)
docker compose --env-file .env -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build
set -a; . ./.env; set +a
curl -X POST localhost:2602/api/haunt -H 'content-type: application/json' -d '{"scenario":"null-candy"}'
for i in $(seq 1 40); do curl -s -o /dev/null localhost:2600/candies/1; sleep 0.5; done
curl -s localhost:2602/api/incidents
docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml down
```
