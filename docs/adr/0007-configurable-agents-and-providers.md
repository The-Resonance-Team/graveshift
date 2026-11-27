# Configurable agents with several AI SDK providers

Status: accepted
Supersedes: ADR 0002

Each agent has one config block: name, role, description with trigger keywords, prompt, params, provider package, model, `baseUrl`, `apiKeyEnv`, allowed tools, daily budget and escalation target. Params are a YAML list of key-value maps used as `{{PARAMS}}` in the prompt; the routing agent fills them from the request. A missing required param leads to one question, then `needs_human`. System agent templates are defaults and client config overrides them by name. API keys stay in environment variables or a secret store, never in YAML.

All gateway controls run on every model call: redaction, daily budget at agent and global level, audit events carrying the agent name, transport retry, one validation retry, evidence validation and the rules-only safety net. Model output still cannot grant permission.

Trade-off: several providers and credentials replace the single-provider simplicity of ADR 0002, and vendor failover is still absent. In exchange, each agent can use the model best suited to its task through official `@ai-sdk/*` packages.
