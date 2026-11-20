# One AI SDK provider for diagnosis

Status: accepted

Diagnosis calls one model through the Vercel AI SDK (`ai` and `@ai-sdk/openai-compatible`), configured by `llm.provider`, `llm.model` and `llm.baseUrl`. The API key comes only from `OPENAI_COMPATIBLE_API_KEY`. The earlier plan was a Bedrock, Gemini, Ollama chain with hand-written HTTP adapters; that chain and its `llm.chain` setting are removed. When the model is unavailable or its output is invalid, Graveshift falls back to the deterministic rules-only diagnosis.

The trade-off: we give up automatic failover between vendors, so an outage of the one endpoint means rules-only diagnoses until it returns. In exchange we drop three adapters and three credential paths, and any OpenAI-compatible endpoint (hosted or self-hosted) works by changing config. This is hard to reverse because the config shape, the `LlmProvider` request (it now carries a Zod schema for `generateObject`) and the docs all assume a single provider. It is surprising because earlier docs promised a chain.

Rejected: keeping the chain behind the SDK (more config and keys for no demonstrated need), and a hand-written HTTP adapter (the SDK already handles structured output and usage). All gateway controls stay: redaction, daily budget, audit events, transport retry, one validation retry, evidence validation and rules-only. Model output still cannot grant permissions.

## Implementation

A fresh Kiro CLI v3 worker committed the migration as `83bd811`. It touched 29 files: 234 insertions and 386 deletions. The work removed the Bedrock, Gemini and Ollama adapters and fixtures from `packages/llm`, added `openAiCompatibleProvider` on `ai@7.0.177` and `@ai-sdk/openai-compatible@3.0.93`, and replaced `llm.chain` with one `provider`, `model` and `baseUrl` in `graveshift.config.example.yaml` and `packages/core`. `.env.example` carries only `OPENAI_COMPATIBLE_API_KEY`. The worker also updated the README, architecture, demo and security docs, the `diagnoser-llm` Kiro specs, and `KIRO_USAGE.md`.

`GenerateRequest` carries a required `schema` because the gateway passes `task.schema` to `generateObject`. The SDK warns that `responseFormat` is not sent unless `supportsStructuredOutputs` is set, and that `generateObject` is deprecated. Both were left as-is: the real-model fixtures in `docs/reports/2026-11-20-real-model-diagnosis.md` returned schema-valid output without the flag. The example price table is zero, so the daily budget does not trip until real prices are entered. A harness that imports workspace packages must live under `apps/daemon`, where those exports resolve.

## Verification

`bun run verify` passed at migration time with 238 tests, 0 failures; `packages/llm` contributed 17 tests. After the review fixes, the full suite passed with 240 tests. No Bedrock, Gemini, Ollama or `llm.chain` reference remains in source or docs, except the ADR history and tests that reject the old config. No secret value entered a tracked file.
