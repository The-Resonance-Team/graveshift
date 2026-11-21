# Remove the v1 daemon and the diagnosis model path

Status: accepted

Diagnosis sends model calls through `@graveshift/gateway`, using the selected Agent name just as patch generation does. The Agent config selects the provider, model, endpoint, key environment variable and daily budget. The gateway owns redaction, the global and per-Agent daily budgets, audit events, transport retry and one validation retry. Medium supplies evidence validation and the deterministic rules-only fallback.

Remove the reference daemon (`apps/_daemon`), the diagnosis gateway (`@graveshift/llm`) and the config used only by that daemon. Keeping the old path would require a second set of model controls and settings. Git history preserves the reference implementation.

The Effect daemon still serves the health route. Diagnosis is checked through the shared gateway with recorded responses and no network access. The daemon needs a use case to call diagnosis.
