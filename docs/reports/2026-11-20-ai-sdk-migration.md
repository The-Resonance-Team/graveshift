# AI SDK migration report (2026-11-20)

Worker: a fresh Kiro CLI v3 terminal ran task W1 on branch `feat/kiroween-full-build`. Result commit: `83bd811`. No credentials or secret values are recorded here.

## Changed

- `packages/llm`: removed the Bedrock, Gemini, and Ollama adapters and their fixtures. Added one `openAiCompatibleProvider` built on `ai@7.0.177` and `@ai-sdk/openai-compatible@3.0.93`. The gateway still owns redaction, the daily budget, audit events, retries, validation retry, and the rules-only safety net.
- `packages/core` and `graveshift.config.example.yaml`: replaced `llm.chain` with one `provider`, `model`, and `baseUrl`. Added `.env.example` with `OPENAI_COMPATIBLE_API_KEY` only.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/SECURITY.md`, `.kiro/specs/diagnoser-llm/*`, and `KIRO_USAGE.md`: removed chain and placeholder-model language.
- Added `docs/adr/0002-single-ai-sdk-provider.md`.
- Scope from `git show --stat 83bd811`: 29 files, 234 insertions, 386 deletions.

## Verification

- `bun run verify` passed: 238 tests, 0 failures. `packages/llm` contributed 17 tests.
- No Bedrock, Gemini, Ollama, or `llm.chain` reference remains in source or docs, except the ADR history and tests that assert rejection of old config.
- No secret value was added to a tracked file.

## Deviations and facts for W2

- `GenerateRequest` has a required `schema` field because the gateway passes `task.schema` to the provider.
- `packages/core` `ConfigSchema` also changed to the single-provider shape.
- The SDK warns that `responseFormat` is not sent unless `supportsStructuredOutputs` is set, and that `generateObject` is deprecated. Both were left as-is. The three real-model fixtures in `docs/reports/2026-11-20-real-model-diagnosis.md` later showed no schema failure, so the flag was not needed.
- The example price table is zero, so the daily budget does not trip until real prices are entered.
- A harness that imports workspace packages must live under `apps/daemon`, where those exports resolve.
