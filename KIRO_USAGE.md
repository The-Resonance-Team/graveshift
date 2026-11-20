# Kiro usage

This file becomes the Kiro usage write-up for the Devpost submission. Sections 1 to 9 are drafted from facts in the repository. Anything marked **capture pending** needs a human to supply screenshots, timings or quotes (issue #16). Nothing here was invented to fill a gap.

## Judging rubric (verified 2026-11-20)

Devpost lists five criteria: Potential Impact, Technological Implementation, Design, Innovation/Idea, and Presentation. Innovation/Idea and Presentation are each 20% (10 points). The submission must include the root `.kiro` directory with specs, hooks and steering; `.gitignore` must not exclude it. The rules state that insufficient use of Kiro can disqualify a submission, and the write-up must show deliberate use of Kiro IDE/CLI, custom agents, hooks, spec-driven development, steering, MCP and property-based testing.

Consequence: every worker in this build uses the Kiro agent, each code slice follows a `.kiro` spec, and each slice records property tests and a build-log line. The demo video and the Devpost form are human-owned and tracked in issue #15.

## 1. Surfaces

- CLI: the build workers were Kiro CLI v3 terminals (binary `kiro-cli`), dispatched one task at a time through Orca. There is no `init` command; setup was manual. V3 hooks use PascalCase triggers: `PreToolUse` blocks only on exit code `2`, and `PostTaskExec` is the spec-task trigger. One worker was replaced after passing 40% context, with a written handoff as its first prompt.
- IDE: capture pending. No IDE-specific evidence is recorded in the repository.
- Crew: not used; the optional Gravekeeper app was not built.
- Free tier question: capture pending.

## 2. Spec-driven development

Twelve specs exist under `.kiro/specs/`, each with `requirements.md`, `design.md` and `tasks.md`: actuator, dashboard, demo-app, diagnoser-llm, discord-banshee, fixer-github, k8s-deploy, mcp-server, policy-engine, redactor, runtime-sources and watcher. Requirements use EARS phrasing (for example "WHEN `propose_fix` is called THE SYSTEM SHALL pass through PolicyEngine").

Ten of the twelve have an implementation. `discord-banshee` and `k8s-deploy` do not (issues #13 and #14). The MCP server tests assert the spec limits directly (50, 100, 200 and the 60-minute PromQL range).

Concrete bug a spec prevented, and the comparison with ad hoc coding: capture pending. No spec-caused catch is recorded yet.

## 3. Steering

Seven files in `.kiro/steering/`: `product`, `tech`, `structure`, `safety` (always included), plus `halloween-voice`, `docker-k8s` and `github-app` (matched by file type). `safety.md` lists eight invariants that the code follows: signed single-use actions, draft-only PRs, pure policy, redaction before outputs, untrusted tags, no `docker.sock`, no secrets, append-only audit and the circuit breaker. The `tech` rule "no provider SDK outside `packages/llm`" is why the model call sits in one gateway package.

Before and after example: capture pending.

## 4. Hooks

Seven hooks in `.kiro/hooks/`:

| Hook | Trigger | Action |
| --- | --- | --- |
| `block-dangerous-shell` | `PreToolUse` on shell | `scripts/kiro/guard-shell.mjs`; blocks on exit code `2`, exit `1` only warns |
| `secret-scan-on-save` | `PostFileSave` | `scripts/kiro/secret-scan.mjs` |
| `typecheck-on-save` | `PostFileSave` on `.ts`/`.tsx` | `bun check && bun lint --no-script` |
| `pbt-on-guardrails` | `PostFileSave` on guardrail paths | `bun test --check` on policy, redactor, actuator, fixer, core state |
| `policy-drift` | `PostFileSave` on policy files | agent re-reads the policy spec and lists unmet requirements |
| `test-companion` | `PostFileSave` on package sources | agent creates or updates the sibling test |
| `spec-task-done` | `PostTaskExec` | agent appends a build-log line here |

Whether and how often each hook fired during the build, and time saved: capture pending. The build log below was written by the orchestrating workers, not by `spec-task-done`.

## 5. Custom agents

`sre-reviewer` (read-only; shell and file writes denied), `chaos-witch` (proposes demo fault scenarios) and `docs-scribe` (maintains docs from specs). A real review caught by `sre-reviewer`: capture pending.

## 6. MCP servers

Built: `graveshift-mcp` in `packages/mcp-server`, over stdio, with 7 tools always on (`list_services`, `list_incidents`, `get_incident`, `get_diagnosis`, `get_audit_log`, `verify_audit_chain`, `propose_fix`), `query_metric` when Prometheus is configured and `tail_logs` when a backend supplies it. It has two prompts (`triage-incident`, `write-postmortem`) and an Autopsy resource. It is a hand-written JSON-RPC server because the team library rules name no MCP SDK. Streamable HTTP with a bearer token is code only. Check run: a stdio session against a fake daemon returned `list_services` with an AWS key redacted.

Consumed servers (GitHub, fetch, Kubernetes) are in `.kiro/settings/mcp.example.json`; the local `mcp.json` is gitignored. One task made possible by the built server in a live Kiro session: capture pending.

## 7. Property-based testing

`fast-check` properties run under `bun test` in the policy, redactor, actuator, fixer guard, core state machine, store audit chain, watcher, llm, diagnoser, metrics, runtime sources and demo app test files. The full suite at the last verification had 239 tests.

Real counterexample found: a property test on the audit chain found that a payload with a `__proto__` key hashed differently than it read back. The fix normalises the payload through Zod before hashing (`packages/store/src/sqlite.ts`), and a regression test covers it.

Other counterexamples: capture pending (none are recorded in the repository).

## 8. Powers

`powers/graveshift/` holds a scaffold (`plugin.json`, `mcp.json`, a `triage` skill). It has not been installed or tested in Kiro. Installed third-party powers: none recorded.

## 9. Lessons learned

Capture pending. Facts to build on: sequential single-task workers kept each change reviewable; a handoff file let a fresh worker continue after the context limit; property tests found a real bug before any user did; several features are specified but not built (Discord, Kubernetes manifests, patch generation), which the docs state plainly.

## Build log

Dates are from the build run on 20 Nov 2026 (ICT). "Corrected" lists fixes made during that run.

| Task | Generated | Corrected |
| --- | --- | --- |
| Core and store | schemas, state machine, `RuntimeSource` contract, hash-chained audit log | `__proto__` payload hash mismatch found by a property test |
| Policy and redactor | deny-first `decide()`, mode lattice, 12 detectors, policy CLI | none recorded |
| Runtime sources and demo | Docker, Kubernetes and Prometheus clients, Haunted Candy Shop with five faults | Docker smoke test showed four scenarios behave as designed; OOM events seen |
| Watcher | seven rules, dedupe, PromQL poller | none recorded |
| LLM and diagnoser | single-provider gateway, budget stop, evidence validation, fixtures | none recorded |
| Fixer and actuator | GitHub App client, patch guard, signed single-use actions, breaker | none recorded |
| Daemon | pipeline, HTTP API, SSE, Haunt panel endpoint | real Docker run: SSE within about 5 s, audit chain verified |
| Dashboard | Next.js graveyard, timeline, wizard | low-contrast text, 375 px tooltip overflow, favicon 404 |
| MCP server and Autopsy | tools, prompts, resource, stdio and HTTP code | lint warnings (shadowed names, await in loop) |
| Docs and verification | README, architecture, security, demo, this file | removed claims the code could not support |
