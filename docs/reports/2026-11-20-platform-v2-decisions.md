# Platform v2 decisions — draft for grilling

Date: 2026-11-20
Status: draft — recorded as stated by the owner; not accepted until grilling ends.

This file records the owner's stated direction for the next version of Graveshift. It will be split into ADRs after the design tree is settled. It is not a spec and not a work plan.

## Goal

Build an "AI First, Agentic DevOps" platform. A DevOps engineer must not need to read logs by hand, open a secure shell, or switch to Grafana or Sentry. The platform centralises monitoring and automation for DevOps and SRE work. In a later phase, the platform builds skills from collected incident cases at large technology companies so agents can build scalable, maintainable, high-trust IT systems.

## Stated decisions (owner's numbering)

1. Refactor the daemon to use the Effect framework, version 4, with Bun.

2. Client-facing integration is a plugin model:
   - Plugins for exporters and monitoring tools such as Prometheus.
   - More plugins for first-class technologies; the NestJS plugin follows the structure of Sentry and PostHog.
   - MQTT carries full data for analysis and filtering.
   - Docker and Kubernetes monitoring are one part of the input, not the whole input.
   - More input sources: current state of serverless, VPS, cloud platform plugins for GCP, Azure and AWS.
   - The daemon contains only business logic and orchestration for supported features.

3. All watcher input goes through a message queue for survival in a large system. Input maps through all rules that the system and the client designed before any feature runs.
   - Open question from owner: focus only on warning and error tags, or include the info type?

4. Important business logic can move to `packages/core`; main orchestration stays in the daemon.

5. Build the dashboard with an "AI first" focus:
   - Main component A: AI Harness chat. Multi-agent conversation in the style of a Grok bot; agents talk to each other to resolve a task from the user or the system.
   - Main component B: overview page. The supplied image was a reference for the goal only, not a design contract.
   - Detail page for a work item, in the style of the supplied image. This page is created after an incident is defined and verified. The frontend engineer owns the visual design.
   - The detail page can triage to `needs_human` or `needs_agent_<name>` where the name comes from config.
   - Automatic resolution and pull request opening are allowed when client config allows it.
   - Strict design is needed because a frontend collaborator (thaian) will join. The frontend needs a schema that is easy to connect to.

11. If the API is built with NestJS, the MCP server uses the official MCP feature built into NestJS.

12. For the candy demo app and for Nginx, reverse proxies and tunnels such as Cloudflare Tunnel or Tailscale: build a guard or plugin, or read directly by patching?

## Open questions from the owner

- Can the daemon run in GitHub Actions? The owner's leaning is to recommend self-hosting on another server, with a paid cloud option later.
- Should the daemon expose the full API, or should a dedicated NestJS API be built locally and talk to the daemon?
- Warning/error only, or all severities including info?

## Conflicts and tensions found during recording

- Decision 2 says the daemon contains only business logic and orchestration. Decision 4 says important business logic moves to `packages/core` and orchestration stays in the daemon. These need one boundary statement.
- ADR 0001 fixes full Kiroween scope and a 05 Dec 2026 deadline. This v2 direction is much larger. State whether v2 starts after submission or replaces the current scope.
- ADR 0002 fixes one AI SDK provider and no fallback chain. A multi-agent harness may need more than one model or provider. State whether ADR 0002 stays, is narrowed, or is superseded.
- Current code has no message queue: the watcher is called in-process by `main.ts`, `feeders.ts` and `poller.ts`. Moving all watcher input to a queue changes the core flow.
- Current code has no patch generator and no `openFix` injection, so no draft PR opens. Decision 5 requires automatic PR opening. State whether patch generation is in this effort.
- `needs_human` is an existing incident state in `packages/core/src/state.ts`. `needs_agent_<name>` is new. State whether it is a state, a substate, or an assignee field.
- The dashboard was removed at the owner's request in commit `874939f`. Decision 5 restores a redesigned dashboard; it is a new project, not a restore of deleted files.

## Round 1 answers (2026-11-20)

### Q1 — confirmed by owner

v2 starts now. v1 is dead. No deprecation period is needed because the packages were never published. Consequence: ADR 0001 becomes superseded. The disposition of PR #17 and the existing code is still open.

### Q10 — confirmed by owner

Each agent has one config block. The system template and the client can configure each agent. Example: an SRE Bot uses `gemini-3.8-flash-high` and a DevOps Bot uses `claude-sonnet-5.5`. Each block carries its own endpoint, model name, API key and compatible `@ai-sdk/*` package. The owner agreed that all gateway controls remain on every call: redaction, daily budget, audit events, transport retry, one validation retry, evidence validation and the rules-only safety net.

Consequence: ADR 0002 is superseded. Graveshift now uses several providers and several credentials. The exact config shape and key storage are still open.

### Q2 to Q9 — provisional

The owner replied "agree remain". This is read as agreement with the recommendations for Q2 to Q9, and as confirmation that gateway controls remain. This reading must be confirmed in round 2 before these become accepted decisions.

## Round 2 answers (2026-11-20)

### Q2 — tenancy

Support single tenant first. Prepare to adapt to multi-tenant in v3. The cloud option also arrives in v3. The owner did not state whether `tenantId` enters the event envelope in v2 or only in v3. Open.

### Q3 — agent config fields

Extend the agent config block with:
- `description` with trigger keywords.
- `prompt`: the task the agent must resolve.
- `params`: a list of field names. The prompt uses `{{PARAMS}}` placeholders. A routing agent fills the required data from the request before the model call. The owner's goal is more reliable use of generative models in production.

Open: which component is the routing agent, and what happens when a required param is missing.

### Q4 — multi-provider config

Confirmed. Add a `provider` field so the system and the client can declare the compatible API package.

### Q5 — MCP

Confirmed. Adapt `@nestjs/mcp`.

### Q6 — Effect rebuild

Confirmed. Move the current daemon to `apps/_daemon`. Scaffold an Effect v4 project from the official CLI and rebuild the daemon from scratch. If the CLI init needs interaction, the owner must run that step manually.

### Q7 — rule overrides

Confirmed. One engine, two rule layers, client rules override system rules by id. The config must detect an override and warn the user before save or during validation.

### Q8 — images

The images are references that show the goal. They are not a design contract and are not recorded as one. The frontend engineer owns the visual design.

### Q9 — fix capabilities

Provide auto-fix with a configured generative model and client-configurable project rules. When the client does not allow auto-fix, show a "Fix now" button. The work item also gets a table and a detail sheet in the style of the supplied image.

Open: whether "Fix now" still requires a policy `allow`, and what it opens.

## Fact checks (2026-11-20)

These are facts gathered by the agent, not decisions.

### Effect v4 on Bun

- Effect 4.0 is stable; core `effect` is at **4.1.5** published 2026-11-20. LTS for 4.x runs to September 2029.
- Bun is an officially supported runtime. `@effect/platform-bun` is at 4.1.5 and provides `BunRuntime`, `BunServices` and `BunHttpServer`. `BunHttpServer` wraps `Bun.serve`.
- Risk: `BunRuntime`, `BunServices` and every `BunHttpServer` export are marked `@stability unstable` since v4.0.0. Unstable APIs may break in minor releases. Every non-`effect` package is currently unstable.
- Migration from plain async code uses `Effect.promise` / `Effect.tryPromise` at the boundary, then `Effect.gen`. The Effect LSP has an "Async to Effect" refactor and tagged-error generation. A third-party v3→v4 codemod exists but inserts manual-review markers.
- v4 renamed many APIs: `Context.Tag` → `Context.Service`, `FiberRef` → `Context.Reference`, `Either` → `Result`. Platform modules moved into `effect`. v3 and v4 must not be mixed in one dependency tree.

### NestJS MCP

- Official `@nestjs/mcp` is at **0.0.4**, published 2026-11-06. It is first-party but early-stage.
- It supports Streamable HTTP and stdio, protocol 2026-07-28 plus 2025 clients, decorators for tools/resources/prompts, guards and OAuth 2.1.
- Limits in this version: no sessions, no runtime tool registration, no multiple MCP servers per app, no request-scoped providers, no 2024-11-05 HTTP+SSE.
- The current Graveshift MCP is a hand-written JSON-RPC handler at `2025-06-18`, with nine tools and two prompts. It has no framework dependency.

### Scaffolding commands

- No official Effect v4 + Bun scaffolder exists. `create-effect-app@0.0.6` is official but generates Effect v3 + pnpm and was last published 2024-10-31. The `effect` package has no `init` bin.
- The officially documented v4 + Bun setup is manual but non-interactive: `bun init -y` then `bun add effect @effect/platform-bun`. Pin `effect@4.1.5` and `@effect/platform-bun@4.1.5`. Entry point uses `BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)))`.
- NestJS has a non-interactive scaffold: `npx @nestjs/cli new <name> --skip-git --skip-install --package-manager bun --no-interactive`. It supports `--directory`.
- Therefore no human-run manual step is required for either scaffold. The owner's condition in Q6 does not trigger.

## Round 3 answers and closure (2026-11-20)

The owner answered Q3 and Q4 and wrote "Agree remain recommends" for the rest. The design tree is closed.

### Q1 — agreed

Round 1 Q2 to Q9 are agreed, with gateway controls on every model call. PR #17 closes unmerged. ADR 0001 is superseded. The old daemon stays at `apps/_daemon` for reference only.

### Q2 — agreed

`tenantId` enters the event envelope and every stored record in v2. Deployment stays single-tenant. Multi-tenant and cloud arrive in v3.

### Q3 — agreed with a concrete params shape

The routing agent is a built-in role with its own model config. It selects the target agent by trigger keywords and fills `{{PARAMS}}` in the prompt. The owner gave this YAML shape for multiple params:

```yaml
params:
  - VERSION: v1
  - INCIDENT_DETAIL: "OOM VPS"
```

A missing required param leads to one question to the user, then `needs_human`. System agent templates are defaults; client config overrides them by name. Keys stay in `apiKeyEnv`, never in YAML.

### Q4 — agreed with two "Fix now" cases

"Fix now" has two cases: it puts the work item at the front of the fix queue, and it is the manual trigger when the client disables auto-fix. Both cases use the same safety path: `decide()` must return `allow`, the model only proposes the patch, and the result is a draft PR. No merge and no runtime action.

### Q5 — agreed

Detect rule overrides at config load and at save. Show a warning and require explicit confirmation before save. Write one audit event. Do not block validation of unrelated rules.

### Q6 — agreed

The frontend consumes generated OpenAPI types from the NestJS API plus a published TypeScript package for event and state types. The frontend engineer owns the visual design. The images are not a contract.
