# Architecture implementation

Base: `feat/platform-v2` (merged PRs #31–#117). Branch: `refactor/all-candidates`. PR #119 targets `feat/platform-v2`.

The owner selected all 33 architecture candidates. ADRs 0019–0022 record the shared decisions. ADR 0008 and the glossary use the clarified assignment rule. The work was rebased onto the current platform-v2 stack: the base's one-config-file decision (PR #104) and project scoping (PR #110) are canonical.

## Execution rules

- A Human assignment is a manual human fix. Auto-fix and Fix now are unavailable.
- An Agent assignment selects the configured Agent. Its `autoFix` trigger setting chooses automatic execution or Fix now.
- Fix now waits for the completed attempt outcome. Admission and queue priority precede execution.
- The Routing agent runs for Work items. It asks one saved question for missing params. A complete answer resumes that attempt; an incomplete answer hands the Work item to a person.
- The daemon owns orchestration. The external interface owns authentication, generated contracts and durable PostgreSQL operations. They use an authenticated private HTTP seam on one host.
- Approved event identity and authorized routing stay stable. Free text and payloads receive privacy processing. Known secrets in routing fields are rejected.
- Model results need durable audit acknowledgement. An audit failure does not cause another model call or terminal audit handoff.
- The shared gateway, policy permission check and draft-only Exorcism remain the execution path.

## Delivery ledger

Every candidate has an implementation and a regression test at its owning module. Four review passes found and fixed replay, privacy, lifecycle and recovery gaps.

| # | Candidate | Area | State |
| --- | --- | --- | --- |
| 1 | Event envelope integrity | core, events, ingest, MCP output | Done |
| 2 | Canonical Patch safety | patch, fixer, one-shot intake | Done |
| 3 | MCP permission facts | MCP HTTP and protocol adapters | Done |
| 4 | Medium prepared evidence | diagnoser | Done |
| 5 | Atomic Blessing admission | actuator, durable action claims | Done |
| 6 | Exorcism publication ownership | fixer | Done |
| 7 | Effective Agent config | agents, boot config | Done |
| 8 | Provider task capability | gateway adapters | Done |
| 9 | Work item transitions | work contract, durable operations, daemon | Done |
| 10 | Complete Fix outcomes | fix execution and HTTP projection | Done |
| 11 | One boot settings owner | external interface config | Done |
| 12 | Credential state and identity | auth, durable operations | Done |
| 13 | One Audit chain owner | audit, PostgreSQL | Done |
| 14 | NATS reader lifetime | events and MCP source adapter | Done |
| 15 | Collector lifetime | Docker, Kubernetes, shared delivery queue | Done |
| 16 | Event type catalog depth | MCP Events | Done |
| 17 | Wraith Event envelope intake | watcher, daemon, NATS consumer | Done |
| 18 | Prometheus observation lifetime | metrics Collector | Done |
| 19 | Grave policy facts and repository | execution context, MCP reads | Done |
| 20 | Runtime policy eligibility | policy, actuator | Done |
| 21 | Importable actuator request path | actuator | Done |
| 22 | Concurrent GitHub credential refresh | fixer | Done |
| 23 | Publication and monitor knowledge | fixer | Done |
| 24 | Gateway accounting ownership | gateway | Done |
| 25 | Gateway completion and audit | gateway, durable audit adapter | Done |
| 26 | Patch correction protocol | patch, gateway | Done |
| 27 | Untrusted text framing | agents, diagnoser, gateway | Done |
| 28 | Plugin registration and capture | plugin-nestjs | Superseded by ADR 0014 (official Sentry SDKs) and base PR #91, which removed the package |
| 29 | Rule override confirmation | pure rule module, request adapter | Done |
| 30 | Understood Diagnosis and Autopsy facts | MCP read seam | Done |
| 31 | Metadata bootstrap | generated contract, runtime assembly | Done |
| 32 | Fix now admission and ordering | Work item, daemon | Done |
| 33 | Active Routing agent handoff | agents, Work item, daemon | Done |

## Review fixes

- A stale triage reply can no longer overwrite a later Human assignment. Receipts record the version they produced.
- A pending question is reachable through `GET /api/work-items/:id/routing` after a lost response or restart.
- Failed Event publication retries the same envelope before a Collector advances its delivery cursor.
- A durable action claim prevents a signed Blessing from running again after restart.
- Fenced leases, heartbeat, abandon and known-failure publication abort recover attempts interrupted before a GitHub write.
- Recovery reads an existing draft without a new policy admission, so it cannot self-deny at the hourly cap.
- Active Haunting lookup by Grave avoids duplicate incidents past the 50-row presentation page.
- The macOS sandbox denies signals to host processes. GitHub token refresh has a bounded deadline.
- The merged foundation migration stays byte-for-byte unchanged. A single follow-up migration carries the architecture changes.

## Code review resolutions

A two-axis review of the full diff found nine actionable items. All are resolved:

| Axis | Finding | Resolution |
| --- | --- | --- |
| Spec | Patch carried no base identity (issue #59) | `PatchSchema` requires `baseSha` and per-file `baseBlobSha`. The guard, verification and one-shot apply reject a stale base before any write. A codemod updated every patch fixture. |
| Spec | Empty reference daemon and diagnosis package remained | The empty directories are removed; no files were tracked. |
| Spec | Fix now for an enabled Agent trigger | ADR 0021 now records the owner's 2026-11-22 clarification: enabled triggers start automatically and reject Fix now. No behavior change. |
| Spec | One internal credential served both directions | `GRAVESHIFT_API_INTERNAL_TOKEN` authenticates daemon/actuator → API; `GRAVESHIFT_DAEMON_INTERNAL_TOKEN` authenticates API → daemon. Boot rejects equal values; each direction has a negative test. |
| Spec | Events stream/subscribe methods admitted before v3 | `/mcp` denies those methods by default; poll-only `events/list` and `events/poll` remain. |
| Standards | Budget day used a banned `Intl.DateTimeFormat` form | `date-fns` + `@date-fns/tz` `TZDate` now computes the UTC accounting day. |
| Standards | Guardrail docs named the deleted `fixer/guard` | `.kiro/steering/tech.md` names `patch/guard`; property tests now exist there. |
| Standards | Generic `Error` throws in production paths | Typed coded error classes added in gateway, MCP, daemon NATS and one-shot apply. |
| Standards | Eleven repeated three-argument Work state calls | A single typed `WorkStateCall` value is passed to each state operation; the private wire format is unchanged. |

## Verification

Run from the repository root with the real files and local Docker. No production credentials, model provider, GitHub account or broker was contacted.

| Gate | Result |
| --- | --- |
| `bun run verify` | 1346 passed, 91 skipped, 0 failed (format, lint, types, test types, tests) |
| `bun run generate:check` | generated contract current |
| `bun run migrate:drift:check` | base canonical drift check: migrations match the schema and audit objects stay on their own tables (2 migration files) |
| `bun run --filter @graveshift/mcp-client drift:check` | ok (9 tools, 2 prompts, 1 resource template) |
| `bun run test:database` | 154 passed, 0 failed in an isolated Docker Postgres |

The database suite includes the real API private HTTP controllers, real Postgres repositories, the daemon command and read handlers, the NATS delivery bridge and recorded model/GitHub adapters. It verifies both authenticated hops, concurrent claims, saved questions across a fresh database client, audit acknowledgement failure, automatic activation before acknowledgement and an intervening Human assignment.

## Retained limits

- Patches carry full file content, not a unified diff. The canonical guard now binds them to base and blob SHAs. Upgrade to a unified diff when the repository line cap rejects a small hunk or review needs per-hunk context.
- Gateway budget counters are process-local. Persist spend before restart-safe daily enforcement or parallel reservation is required.
- Kubernetes watch expiry can leave an observation gap. The read role must cover the configured namespaces.
- Linux verification needs bubblewrap. That platform was not exercised on this macOS host; sandbox startup failure blocks publication.
- Partial Exorcism remote effects that never yield a reference stay uncertain and need manual inspection, not automatic retry.
- Banshee approval collection, push/webhook delivery, separate-host deployment and the dashboard remain outside this effort.
