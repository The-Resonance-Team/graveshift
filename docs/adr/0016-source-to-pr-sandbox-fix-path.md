# The fix path reads real source, verifies in a sandbox, and publishes a draft pull request

Status: accepted

On 2026-11-22 ticket #59 made the fix path a real source-to-PR flow. Before this change the path stopped early: the diagnosis context provider always failed closed, so no model call, no source read and no pull request happened. The ADR records what the path now does and which seams keep it safe and testable.

## Contract

A model reply is a **Patch proposal**: `{ baseSha, files: [{ path, baseBlobSha, diff | content, linesChanged }] }`. One file carries a unified diff or full text, never both. A new file names the git empty-blob SHA. The proposal is pinned to one base commit and to the base blob of every file it changes.

`packages/patch` holds `applyUnifiedDiff` and `resolvePatch` as pure functions. A proposal fails when the base SHA moved, when a base blob SHA no longer matches, or when a hunk's context no longer matches. Full file text is derived after apply, so the base cannot move under a change and the guard always checks the resolved content. `guardPatch` keeps its full-content contract. `PatchSchema` stays the guard and fixer contract.

## Seams

- `SourceProvider` (`packages/fixer/src/source.ts`) reads the base ref, the recursive tree and every blob through the injected `GitHubClient`, which gained `listTree` and `getBlobBytes`. The real implementation reads only: every failure throws, so a fix fails closed instead of continuing on partial source. Binary blobs keep exact bytes and carry no text.
- `FixWorkspace` (`packages/fixer/src/sandbox.ts`) writes the base bytes to a throwaway directory, applies the resolved patch, then runs the configured check commands. Check commands come only from `fix.sandbox.commands` in the committed config file, never from the model or the repository. An empty command list blocks every fix. Each command runs with an exact environment allowlist (`PATH`, `HOME`), so no model key, GitHub App key or other secret reaches the process, and under a per-OS network jail (`sandbox-exec` on macOS, `unshare -rn` on Linux, which needs no extra privilege). The jail is proven, not assumed: one trivial command starts under it first, and a platform with no jail that can start blocks every fix. Every command has a timeout with a kill and a capped output.
- `openDraftPr` takes the pinned base `{ sha, treeSha }` and re-checks the live ref before its first mutating call, so a base that moved after the read raises `StaleBaseError` and nothing is pushed. The tree is built against the pinned base tree. The client still has no merge method, the pull request is still a draft, and `guardPatch` still runs before any client call.
- `FixContextProvider` is real. `apps/api/src/fix/fix.context.ts` builds confidence, category and signals from the triage labels on the Work item, and the counters from stored Work item data and the gateway audit ledger. A missing or malformed label fails closed before any source read, model call or GitHub call.

`FixDeps` gained `source`, `workspace`, `sandbox` and `now`. `PrRef` gained `openedAt`: the time Graveshift opened the pull request, which is the source for the open-PR-per-hour policy counter. New failure codes `source_unavailable`, `checks_failed` and `stale_base` are part of the wire contract.

## Order

The order is fixed: context, then `decide()`, then the source read, then the model call, then resolve and guard, then the sandbox checks, then the stale-base re-check, then the push and the draft PR. Nothing after the policy gate can grant permission: model output is data, the source text enters the prompt wrapped as untrusted data, and only a passed verification publishes.

## Offline testing

Committed tests use the `emulate` GitHub and AI emulators plus injected fakes. No test uses a real model key, makes a real GitHub call, sends a secret, or touches the network. The e2e suite seeds real repository files through the emulator contents API, reads the real base, tree and blob SHAs, answers the model with a canned proposal pinned to those SHAs, and reads the pushed head tree back as real git objects to prove the diff landed. The sandbox check commands run for real through the production spawn runner, so the child process sees only the environment allowlist. Where the host can start the platform jail the e2e runs under it; where the host refuses one (GitHub-hosted Ubuntu blocks unprivileged user namespaces) the e2e still starts every check as a real subprocess without the jail prefix, and `packages/fixer/src/sandbox.test.ts` pins the jail argv, the allowlist, the timeout kill and the fail-closed default.

## Deferred

The daemon read surface (ticket #48) has no writers, and its counters answer `source: 'not_wired'`. The local provider therefore derives confidence, category and signals from triage labels and the counters from the store and the in-process gateway spend ledger, each marked with a `ponytail:` comment and an upgrade trigger. `actionsLast10Min` and `diagnosisLoops` are structurally zero until the runtime-action ledger (#49) and the watcher loop (#61) exist. GitLab, GitHub Actions, dashboard UI and runtime actions stay out of scope.

Rejected alternatives: trusting a model-supplied full file text with no base pin (a newer commit could be overwritten); running checks on the developer checkout or with inherited environment (a leak of secrets and network); publishing then waiting for CI to fail (a draft PR would still advertise an unverified change as the fix).

Trade-off: the fix path now makes more read calls before the first mutation, and the owner must supply check commands per deployment. In exchange a pull request only appears when the change applies to the exact base, the guard accepts the resolved content, and the configured checks pass without secrets or network.
