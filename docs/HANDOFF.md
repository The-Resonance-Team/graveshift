# Handoff — Graveshift feature build (8 tasks complete)

Date: 20 Nov 2026. Orca Run: `run_bbbaab5746c7`. Source of truth: issue #10, the 12 `.kiro/specs/`, and `docs/adr/0001-full-scope-for-kiroween.md` (full scope, no cuts). Work in `/Users/xirothedev/workspace/graveshift`, current worktree. All changes are uncommitted.

The first Kiro CLI v3 terminal ran eight sequential tasks and passed 40% context. Per `rules/general.md` #24 in `The-Resonance-Team/skills`, it must be replaced. Start a fresh Kiro v3 worker with this file as its first input. Kiro v3 shows a startup trust dialog with default "No, exit"; send one Down arrow, verify the terminal shows `Trust All Tools active`, then dispatch the task.

## Completed work (8 tasks)

1. **Core and store** (`task_0a5c44d05a2a`) — `packages/core`: Zod schemas, incident state machine with guards and circuit-breaker helper, `RuntimeSource` contract at `@graveshift/core/contract`, minimal config loader. `packages/store`: hash-chained append-only audit log with `verifyChain()`, Drizzle bun-sqlite. Property testing found and fixed a `__proto__` payload hash mismatch by normalizing with Zod before hashing.
2. **Policy and redactor** (`task_5a89d5660089`) — `packages/policy`: Zod/YAML loader, deny-first default-deny `decide()`, mode lattice with safer-mode env clamp, rate and confidence gates, audit events, fast-check properties. `packages/redactor`: 12 ordered detectors, `[REDACTED:type]` markers, idempotence, about 44 µs per 1 KB. `graveshift policy check` CLI is linked from the root via a workspace devDependency.
3. **Runtime sources and demo** (`task_e86ba75c7ced`) — `packages/metrics`, `sources-docker` (fetch to socket proxy), `sources-k8s` (`@kubernetes/client-node` 2.0.2, read-only). All pass the shared contract with backoff and cursor resume. Haunted Candy Shop has five fault scenarios, tokens, metrics and owner-only reset. Real Compose files exist. Docker smoke test: `null-candy`, `slow-curse`, `wrong-potion`, `memory-leech` worked; OOM produced real exit-137 events that the Docker source mapped to signals.
4. **Watcher** (`task_6ad7f744f2cb`) — `packages/watcher`: seven rules, 10-minute fingerprint dedupe, one incident per service, severity in `IncidentChange`, Salt-line silence before dedupe, PromQL poller that skips failed queries, fast-check properties. Event time is assumed non-decreasing per service (`ponytail:` marker).
5. **LLM and diagnoser** (`task_26adb58a0f4f`) — `packages/llm`: one AI SDK model (`openai-compatible`) → rules-only, budget stop, timeout/retry, prompt redaction, audit callback, injected fetch. `packages/diagnoser`: context caps, untrusted wrapping, evidence validation with one retry then `needs_human`, rules-only fallback, three recorded fault fixtures.
6. **Fixer and actuator** (`task_5e6df46a1b72`) — `packages/fixer`: GitHub App JWT/installation auth, patch guard before any GitHub call, `graveshift/inc-<shortid>-<slug>` branches, draft PRs labelled `graveshift`/`exorcism`, no merge method, 30 s check polling. `packages/actuator`: HMAC requests, single-use 15-minute tokens, policy `decide()` gate, Docker restart and K8s rollout/scale, circuit breaker. Fake-client evidence covered draft PR, approved K8s restart, denied postgres and non-approver, replay stopped by rate limit.
7. **Daemon** (`task_afe4b9865be2`) — `apps/daemon`: watcher → diagnoser → policy `open_pr` → optional fixer → audit chain, no-op `Notifier` seam, `Bun.serve` API and SSE, token-gated Haunt panel with 30 s rate limit. `packages/actuator/src/main.ts` adds `POST /actions`, `/healthz` and refuses to start without a 32+ character `ACTUATOR_HMAC_SECRET`. Real Docker run: haunt produced SSE within ~5 s, incident reached `diagnosed`/`code_bug`, audit chain verified, unsigned actuator request got 403.
8. **Dashboard** (`task_ad747ed0392e`) — `apps/dashboard`: Next.js 16, Tailwind v4, React Query, axios. Graveyard grid, incident timeline with PR link, audit badge, Haunt panel with matching cooldown, mode view, SSE hook with backoff, first-run wizard, same-origin proxy to daemon. `DESIGN.md` responsive rules, icon vocabulary and neutral tokens filled. Root verify: 230 tests; dashboard check and `next build` pass. 21-row QA matrix in `docs/qa/coverage-matrix.md`: 0 unexpected console errors, SSE reached DOM 3–23 ms after emit. Fixed low-contrast Blood text, 375 px tooltip overflow and favicon 404.

`bun run verify` passes on the merged tree (230 tests). `bun install` has been run after root dependency changes. Docker engine was restarted with `orb start`; it is healthy (server 29.8.2).

## Remaining orchestration tasks

- `task_cba26b81af12` — **MCP server and postmortem** (ready). Spec: `/private/var/folders/gs/h6f9nkc50716wx9vzfr70mt00000gn/T/opencode/graveshift-specs/08-mcp.md`. Read tools, `propose_fix` through policy, PromQL allowlist, redaction, stdio transport plus HTTP code only, Autopsy generator and prompts.
- `task_c98549436644` — **Docs and verification gates** (blocked until MCP settles). Spec: `09-docs-verify.md` in the same directory. Replace stubs in README, ARCHITECTURE, SECURITY, DEMO; draft KIRO_USAGE with real facts; final `bun run verify`.

Do not submit to Devpost. External work lives in issues #12–#16.

## Open items to carry forward

- No patch generator exists, so `openFix` is unset and no real draft PR opens. Fixer code and fake-client evidence are ready.
- Incidents are in memory (`ponytail:`). Consumed actuator token IDs are also in memory; persist them if a restart inside the TTL matters.
- Daemon exposes no approval or silence endpoints, so Blessing and Salt line are glossary terms only in the UI. Discord Banshee is issue #13.
- Dashboard is English only; the VI column is unused. `DAEMON_URL` is baked at build time by Next rewrites. Haunt panel has no approver auth because the daemon has none.
- K8s source is fixture-tested only; no cluster was available. Public k3s demo is issue #14.
- Demo API port 2600 may be occupied by another local app; reach the demo API from inside the Compose network.
- Diagnosis category values were chosen locally.
- ORM choice in `docs/DECISIONS.md` still says owner-unconfirmed for Drizzle versus Bun.SQL.

## Verification commands

```sh
bun run verify
bun packages/policy/src/cli.ts policy check policy.example.yaml
docker compose -f deploy/compose/demo.compose.yml config
docker compose -f deploy/compose/graveshift.compose.yml ps
```

## Final status (20 Nov 2026)

Task 9 (MCP server) and task 10 (docs and verification) are complete. All 10 tasks in Run
`run_bbbaab5746c7` are done. `bun run verify` passes with 239 tests. The docs worker
reported that `deploy/kind/bootstrap.sh` is still a placeholder, `deploy/k8s` has no
Deployments or kind overlay, and `kind` is not installed; the docs state this honestly.
Remaining work is only issues #12–#16: credentials, Discord Banshee, k8s manifests and
public demo, OpenMotion video and Devpost form, and Kiro usage evidence.
