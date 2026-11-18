# Research: Kiro CLI init and the `.kiro` scaffold

Ticket: #7 (part of #1). Researched on 2026-11-18.
Status: verified against first-party docs. The `kiro` / `kiro-cli` binary was not installed locally, so no command was run.

## Short answer

1. No. The Kiro CLI has no `init` or `new` command that makes a project scaffold. Create the `.kiro` tree by hand. The CLI setup guide uses `mkdir -p .kiro/steering`.
2. Kiro reads five workspace locations: `steering/`, `specs/`, `hooks/`, `agents/`, `settings/mcp.json`. No rule says a repo must have all five; Kiro works with none of them.
3. Steering front matter uses `inclusion` and `fileMatchPattern`. Modes: `always`, `fileMatch`, `manual`, `auto`.
4. Standalone hooks use `.kiro/hooks/*.json` with `"version": "v1"`. `PostFileSave` and `PreToolUse` are valid PascalCase V3 triggers. A `PreToolUse` command blocks a tool when it exits with code `2`.
5. Every spec folder holds `requirements.md`, `design.md`, `tasks.md`.
6. For a skeleton-only repo, use the minimum tree in §6 below. Keep the directories valid but thin. Do not create a large empty spec tree.

## Sources

Primary sources, read on 2026-11-18:

- CLI install and binary: <https://kiro.dev/docs/cli/>
- CLI setup (`mkdir -p .kiro/steering`): <https://kiro.dev/docs/cli/setup/>
- CLI command reference (no `init`/`new`): <https://kiro.dev/docs/reference/cli-commands/>
- Chat session commands (`/chat new`): <https://kiro.dev/docs/cli/chat/session-management/>
- First project (spec phases, IDE-only steering generation): <https://kiro.dev/docs/getting-started/first-project/>
- Steering (front matter, inclusion modes): <https://kiro.dev/docs/steering/>
- CLI V3 new features (steering front matter note): <https://kiro.dev/docs/cli/v3/new-features/>
- Hooks (file schema, fields, locations): <https://kiro.dev/docs/hooks/>
- Hook types (trigger list, PreToolUse blocking): <https://kiro.dev/docs/hooks/types/>
- Hooks migration (PascalCase, trigger mapping): <https://kiro.dev/docs/cli/v3/hooks-migration/>
- Specs (three files, three phases): <https://kiro.dev/docs/specs/>
- Feature specs (EARS, file roles): <https://kiro.dev/docs/specs/feature-specs/>
- Headless mode (hooks in non-interactive runs): <https://kiro.dev/docs/cli/headless/>
- Agent config (`.kiro/agents/`, `.kiro/settings/mcp.json`): <https://kiro.dev/docs/cli/v3/agent-config/>, <https://kiro.dev/docs/cli/v3/upgrade-agent/>

Secondary source: `/Users/xirothedev/Downloads/GRAVESHIFT_BOOTSTRAP.md`, sections 15 and 21.

Context7 CLI was used first. Library IDs: `/websites/kiro_dev_cli`, `/websites/kiro_dev`.

## 1. Install command, binary name, and `init`

| Item | Verified fact | Source |
| --- | --- | --- |
| Install | `curl -fsSL https://cli.kiro.dev/install | bash` | `kiro.dev/docs/cli/` |
| Binary | `kiro-cli` | `kiro.dev/docs/cli/` |
| Start a session | `cd my-project && kiro-cli` | `kiro.dev/docs/cli/` |
| `init` / `new` command | None exists | `kiro.dev/docs/reference/cli-commands/` |

The CLI command reference lists these commands only: `crew`, `agent`, `chat`, `acp`, `update`, `integrations`, `login`, `logout`, `whoami`, `settings`, `diagnostic`, `issue`, `version`, `mcp`. There is no `init` or `new`. `/chat new` starts a fresh conversation; it does not create files (`kiro.dev/docs/cli/chat/session-management/`). In V3 chat there is `/spec new`, which starts a spec inside a session; it is not a project scaffold (`kiro.dev/docs/cli/v3/new-features/`).

The CLI setup guide creates the scaffold by hand:

```bash
mkdir -p .kiro/steering
# add .kiro/steering/project.md
```

The **Generate Steering Docs** button exists in the IDE only. The CLI tab of `first-project` does not offer it. So neither CLI nor IDE writes the full `.kiro` tree at once. Hand-author the tree.

Bootstrap note: the ticket says the binary was not installed locally on 2026-11-18. This research does not change that fact.

## 2. The `.kiro` tree Kiro reads

Recognized workspace locations:

```text
.kiro/
├── steering/            # *.md — workspace steering; AGENTS.md also works
├── specs/               # <feature>/{requirements,design,tasks}.md
├── hooks/               # <id>.json — standalone hooks
├── agents/              # custom agent configs (*.json; prompt files may sit beside them)
└── settings/
    └── mcp.json         # MCP servers
```

Facts:
- Workspace steering lives in `.kiro/steering/`. Global steering lives in `~/.kiro/steering/`. Workspace steering wins on conflict. `product.md`, `tech.md`, `structure.md` are the three foundation files; they load in every interaction by default. (`kiro.dev/docs/steering/`)
- `AGENTS.md` is supported at the repo root. It is always included and has no inclusion modes. (`kiro.dev/docs/steering/`)
- Specs are the three files named in §5. Folder names are the feature name. (`kiro.dev/docs/specs/`, bootstrap §15)
- Workspace hooks live in `.kiro/hooks/*.json`. CLI V3 also loads `~/.kiro/hooks/*.json`. Hooks activate at session start with no registration. (`kiro.dev/docs/hooks/`)
- Custom agents live in `.kiro/agents/`. The upgrade command scans that folder by default. (`kiro.dev/docs/cli/v3/upgrade-agent/`)
- MCP servers live in `.kiro/settings/mcp.json`. (`kiro.dev/docs/cli/v3/migration-guide/`, `kiro.dev/docs/cli/v3/agent-config/`)

No official page shows a single "required project tree". These are recognized locations. A project may use any subset. The bootstrap §15 tree (steering, specs, hooks, agents, settings) matches these locations exactly. Rule 7 and submission item 2 of the bootstrap say to keep `/.kiro` at the root and never gitignore it.

## 3. Steering front matter

YAML front matter must be the first content in the file. No blank lines or text may come before it.

Exact keys:

```yaml
---
inclusion: always
---
```

```yaml
---
inclusion: fileMatch
fileMatchPattern: "**/*.tsx"
---
```

```yaml
---
inclusion: fileMatch
fileMatchPattern: ["**/*.ts", "**/*.tsx", "**/tsconfig.*.json"]
---
```

```yaml
---
inclusion: manual
---
```

```yaml
---
inclusion: auto
name: api-design
description: REST API design patterns. Use when creating or modifying API endpoints.
---
```

| Key | Mode | Meaning |
| --- | --- | --- |
| `inclusion` | `always` | Default. Loaded in every interaction. |
| `inclusion` | `fileMatch` | Loaded when the active files match `fileMatchPattern`. |
| `inclusion` | `manual` | Loaded on demand with `#name` in chat; also a slash command. |
| `inclusion` | `auto` | Loaded when the request matches `description`. |
| `fileMatchPattern` | — | String or array of strings. Exact camelCase spelling. Used only with `fileMatch`. |
| `name` | — | Required for `auto`. |
| `description` | — | Required for `auto`. |

Notes:
- CLI V3 supports all four modes. CLI V1/V2 support only part of them.
- The CLI V3 new-features page adds a nuance: `auto` is decided by the harness from the context, not set directly by a single front-matter switch. The steering page gives the `name` + `description` form above.
- Bootstrap drafts use `inclusion: always`, `inclusion: fileMatch`, and `fileMatchPattern: [...]`. All three are valid. The array form is documented.

Sources: `kiro.dev/docs/steering/`, `kiro.dev/docs/cli/v3/new-features/`.

## 4. Standalone hooks and triggers (CLI V3)

### 4.1 File format and fields

Location: `.kiro/hooks/<id>.json`. Use kebab-case names. One file may hold several hooks.

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "lint-on-save",
      "description": "Lint TypeScript after the agent saves a file",
      "trigger": "PostFileSave",
      "matcher": "\\.(ts|tsx)$",
      "action": { "type": "command", "command": "npx eslint --fix" },
      "timeout": 60,
      "enabled": true
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | yes | Schema version. Currently `"v1"`. |
| `hooks` | yes | Array of hook definitions. |
| `hooks[].name` | yes | Human-readable identifier. |
| `hooks[].description` | no | Documentation only. |
| `hooks[].trigger` | yes | PascalCase event name. |
| `hooks[].matcher` | no | Filter. For `PostFileSave`, a regex on the file path. For `PreToolUse`, a tool selector or regex on the tool ID. Default: match all. |
| `hooks[].action.type` | yes | `"command"` or `"agent"`. |
| `hooks[].action.command` | if command | Shell command. Runs in the project root. Gets the event JSON on STDIN. |
| `hooks[].action.prompt` | if agent | Prompt text injected into the conversation. |
| `hooks[].timeout` | no | Seconds. Default `60`. `0` disables. Ignored for agent actions. |
| `hooks[].enabled` | no | Default `true`. |
| `hooks[].confirm` | no | Confirmation prompt for `Stop` command hooks only. |

Source: `kiro.dev/docs/hooks/`.

### 4.2 Valid V3 trigger names

The migration guide says to use PascalCase when hand-authoring standalone hooks. Legacy camelCase strings stay as compatibility aliases. Mapping from CLI 2.x:

| CLI 2.x | CLI V3 |
| --- | --- |
| `agentSpawn` | `SessionStart` |
| `userPromptSubmit` | `UserPromptSubmit` |
| `preToolUse` | `PreToolUse` |
| `postToolUse` | `PostToolUse` |
| `stop` | `Stop` |

Full V3 trigger list (`kiro.dev/docs/hooks/types/`):

| Trigger | Fires when | Matcher matches | Can block? |
| --- | --- | --- | --- |
| `SessionStart` | session begins | not evaluated | no |
| `UserPromptSubmit` | user submits a prompt | not evaluated | no |
| `PreToolUse` | before a tool runs | tool name or group | **yes** |
| `PostToolUse` | after a tool runs | tool name or group | no |
| `PostFileCreate` | Kiro creates a file | file path | no |
| `PostFileSave` | Kiro saves or edits a file | file path | no |
| `PostFileDelete` | Kiro deletes a file | file path | no |
| `PreTaskExec` | before a spec task runs | not evaluated | **yes** |
| `PostTaskExec` | after a spec task completes | not evaluated | no |
| `Stop` | Kiro finishes a response | not evaluated | no |

V3-only additions: `SessionEnd`, `PreCompact` / `PostCompact` (CLI 3.1.0+), `PermissionRequest` (CLI 3.4.0+).

**Verdict on the two triggers in the ticket:** `PostFileSave` and `PreToolUse` are both valid, exact PascalCase V3 trigger names. The migration guide does not replace them; it only maps older camelCase spellings. The bootstrap drafts are correct on this point.

The bootstrap `spec-task-done` hook guesses a "spec task complete" trigger name. The exact V3 name is `PostTaskExec`. Use that.

### 4.3 How a `PreToolUse` command blocks a tool

Exit code rules for a `PreToolUse` command hook:

| Exit code | Result |
| --- | --- |
| `0` | Allow the tool. |
| `2` | **Block the tool.** STDERR goes back to the LLM. |
| other | Show a warning to the user. Allow the tool. |

In CLI 3.4.0+, a hook that exits `0` may also print a structured decision on STDOUT. The fields are `permissionDecision` (`allow`, `ask`, `deny`) and `permissionDecisionReason`; `updatedInput` can replace the tool input. `deny` blocks the call and returns the reason to the agent. When several hooks run, any `deny` or exit code `2` wins over `allow`.

Consequence for Graveshift: the bootstrap `scripts/kiro/guard-shell.mjs` draft says to "exit 1". Exit `1` only warns; it does **not** block. Use exit `2` for a hard block, or print a structured `deny` decision on CLI 3.4.0+. Keep `matcher: "shell"`; `"shell"` is a valid V3 tool tag that covers `execute_bash` and `execute_pwsh`.

Headless runs also load workspace hooks from CLI 2.27.1 onward. A blocking hook is final even with `--trust-all-tools` or `--trust-tools`. Source: `kiro.dev/docs/cli/headless/`.

Sources for §4: `kiro.dev/docs/hooks/`, `kiro.dev/docs/hooks/types/`, `kiro.dev/docs/cli/v3/hooks-migration/`, `kiro.dev/docs/cli/headless/`.

## 5. Spec folder convention

Every spec holds three files:

```text
.kiro/specs/<feature-name>/
├── requirements.md
├── design.md
└── tasks.md
```

| File | Content |
| --- | --- |
| `requirements.md` | User stories and testable acceptance criteria. Kiro uses EARS: `WHEN [condition] THE SYSTEM SHALL [behavior]`. |
| `design.md` | Architecture, data flow, interfaces, data models, error handling, test strategy. |
| `tasks.md` | Discrete, trackable tasks. The bootstrap uses checkboxes that reference requirement IDs. |

Three phases: Requirements → Design → Tasks. A Flow variant exists (Design → Requirements → Tasks) for design-driven work. Quick Spec skips the approval gates. Bugfix Specs use `bugfix.md` instead of `requirements.md`.

The bootstrap §15 tree names 12 spec folders and states the three-file convention. That matches the docs.

Sources: `kiro.dev/docs/specs/`, `kiro.dev/docs/specs/feature-specs/`, `kiro.dev/docs/getting-started/first-project/`, bootstrap §15.2.

## 6. Recommended `.kiro` depth for the skeleton

### Docs-required vs bootstrap-proposed

| Layer | What it means |
| --- | --- |
| Docs-required | Kiro recognizes the locations and file formats above. It does not force a repo to contain them. A repo with no `.kiro` still works. |
| Bootstrap-proposed | Section 15 asks for 7 steering files, 12 spec folders (36 files), 7 hooks, 3 agents, and `settings/mcp.json`. The bootstrap calls `.kiro` depth a "never cut" item. Those are project goals, not tool requirements. |

A skeleton-only repo has no feature code. Filling 36 spec files with hollow stubs would create noise and would not match the docs' view of a spec as a real artifact. Keep the structure, keep it valid, and keep it thin.

### Recommended skeleton (no feature code)

Exact file list:

```text
.kiro/
├── steering/
│   ├── product.md              # inclusion: always; vision, personas, constraints
│   ├── tech.md                 # inclusion: always; stack, strict TS, Zod, pnpm, Vitest
│   ├── structure.md            # inclusion: always; §6 tree + runtime integration rule
│   └── safety.md               # inclusion: always; product safety invariants (SEC-1..SEC-12)
├── specs/
│   └── policy-engine/
│       └── requirements.md     # one real spec; add design.md + tasks.md in D1
├── hooks/
│   └── block-dangerous-shell.json   # PreToolUse, matcher "shell", command exits 2 to block
├── agents/
│   └── sre-reviewer.md         # read-only reviewer; no edits
└── settings/
    └── mcp.example.json        # committed template; local mcp.json stays untracked
```

Rules for this skeleton:
- Commit all of `.kiro`. Never gitignore it. Bootstrap rule 7 and submission item 2.
- Write real, short content in each file. Do not leave empty files.
- Start with one spec folder, not twelve. Add folders during D1–D15 as the features start.
- Keep one real hook. `PostFileSave` typecheck can wait until source files exist.
- Use `PostTaskExec` for the future build-log hook; the guessed trigger name in bootstrap §15.3 is not a V3 name.
- Use `mcp.example.json` now. Add a secret-free `mcp.json` only when a server is wired. Never commit a token.
- If patterns target folders that do not exist yet (for example `apps/dashboard/**`), that is safe. The patterns simply will not match until the folders appear.

This tree gives a clean skeleton that Kiro loads on day one and that can grow into the full bootstrap §15 tree without renaming paths.

## Corrections to the bootstrap pack

| Bootstrap draft | Verified change |
| --- | --- |
| `guard-shell.mjs`: "exit 1" to block | Exit `2` blocks. Exit `1` only warns. Or print a structured `deny` on CLI 3.4.0+. |
| `spec-task-done.json`: guessed trigger name | Use `PostTaskExec`. |
| `fileMatchPattern: ["..."]` | Valid. Keep it. |
| `PostFileSave`, `PreToolUse` | Valid PascalCase V3 triggers. Keep them. |
| `matcher: "shell"` | Valid V3 tool tag. Keep it. |
| 12 spec folders at scaffold time | Tool does not require this. Start with one folder; grow to twelve. |
