# One AI SDK provider for diagnosis

Status: accepted

Diagnosis calls one model through the Vercel AI SDK (`ai` and `@ai-sdk/openai-compatible`), configured by `llm.provider`, `llm.model` and `llm.baseUrl`. The API key comes only from `OPENAI_COMPATIBLE_API_KEY`. The earlier plan was a Bedrock, Gemini, Ollama chain with hand-written HTTP adapters; that chain and its `llm.chain` setting are removed. When the model is unavailable or its output is invalid, Graveshift falls back to the deterministic rules-only diagnosis.

The trade-off: we give up automatic failover between vendors, so an outage of the one endpoint means rules-only diagnoses until it returns. In exchange we drop three adapters and three credential paths, and any OpenAI-compatible endpoint (hosted or self-hosted) works by changing config. This is hard to reverse because the config shape, the `LlmProvider` request (it now carries a Zod schema for `generateObject`) and the docs all assume a single provider. It is surprising because earlier docs promised a chain.

Rejected: keeping the chain behind the SDK (more config and keys for no demonstrated need), and a hand-written HTTP adapter (the SDK already handles structured output and usage). All gateway controls stay: redaction, daily budget, audit events, transport retry, one validation retry, evidence validation and rules-only. Model output still cannot grant permissions.
