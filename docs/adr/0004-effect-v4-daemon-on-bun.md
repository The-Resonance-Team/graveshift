# Rebuild the daemon in Effect v4 on Bun

Status: accepted

> [ADR 0009](0009-remove-v1-daemon-and-diagnosis-model-path.md) removed the reference daemon and `packages/llm`.

The new daemon is written from scratch in Effect v4 (`effect@4.1.5`, `@effect/platform-bun@4.1.5`) on Bun. The old daemon moves to `apps/_daemon` and is not extended. Scaffolding is non-interactive: `bun init -y`, then `bun add effect @effect/platform-bun`. No official Effect v4 + Bun scaffolder exists.

The daemon is the only long-running service that owns use cases and orchestration. `packages/core` holds pure domain logic and schemas with no Effect runtime and no I/O.

`BunRuntime`, `BunServices` and `BunHttpServer` are marked `@stability unstable` in v4, so the HTTP edge sits behind a thin adapter that can be replaced. Trade-off: we accept unstable edge APIs and a real learning curve for typed errors and layers, in exchange for typed error channels and structured concurrency in a long-lived orchestrator.
