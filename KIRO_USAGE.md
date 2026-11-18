# Kiro usage

This file becomes the Kiro usage write-up for the Devpost submission. It is a scaffold now. Each section fills in during the build.

## 1. Surfaces

- IDE: primary surface. Add concrete examples of spec-driven work.
- CLI: the binary is `kiro-cli`. There is no `init` command; setup is manual. State here whether the free tier allowed the planned usage.
- Crew: only if the optional Gravekeeper app is built.

## 2. Spec-driven development

Planned: twelve specs under `.kiro/specs/`, each with `requirements.md`, `design.md` and `tasks.md`. Acceptance criteria use EARS phrasing. Record one concrete bug a spec prevented, and compare it with ad hoc coding.

## 3. Steering

Planned: `always` steering for product, tech, structure and safety. `fileMatch` steering for Halloween copy, container and Kubernetes files, and GitHub App code. Record a before and after example.

## 4. Hooks

Planned: seven hooks. Highlight the `PreToolUse` shell gate. A command hook blocks a tool only on exit code `2`; exit code `1` only warns. Record the time saved.

## 5. Custom agents

Planned: `sre-reviewer`, `chaos-witch` and `docs-scribe`. Describe one real review caught by `sre-reviewer`.

## 6. MCP servers

Planned: consumed servers (GitHub, fetch, Kubernetes) and the built `graveshift-mcp`. Describe one task made possible by the built server.

## 7. Property-based testing

Planned properties: redactor, policy engine, state machine, approvals, patch guard and audit chain. `fast-check` runs under `bun test`. Keep a log of real counterexamples found.

## 8. Powers

Planned: the `powers/graveshift/` package. List installed powers and what they changed.

## 9. Lessons learned

Fill in at the end of the build.

## Build log

Append one line per completed spec task: date in ICT, spec name, task, what Kiro generated, what was corrected and why.
