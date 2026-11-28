# Independent QA section — Manage slice (`manage-`)

Reviewer: dispatched worker `task_427397711672` (independent section). Scope is limited to the
routes below. This file is the only report file this reviewer writes; `coverage.md` and other
report/source files are untouched.

- Target: `http://localhost:3217` (`apps/console`, deterministic in-memory fixtures).
- Viewports: 1280×800 (desktop), 768×1024 (tablet), 375×812 (mobile, `mobile:true`).
- Tool: connected `browse` MCP in a single owned tab (`id=manage-console`, group
  `manage-qa-slice`), viewport emulation, `colorScheme:dark`, `scale:"device"`, `fullPage:true`.
- Screenshots captured first in private temp
  `/private/var/folders/gs/h6f9nkc50716wx9vzfr70mt00000gn/T/opencode/manage-qa-shots/`,
  then copied with `cp -n` (no overwrite) into
  `docs/qa/console/runs/2026-11-28/screenshots/` with the unique `manage-` prefix.
- Fixture data, planned/disabled actions and the "sample data / no live effects" notices are
  expected by design and are not findings.

## Blocker (recorded)

Browser Chrome DevTools MCP is unavailable: its Chrome profile is already in use. Per instruction
no process was killed and no server was restarted; all evidence in this section was collected
with the `browse` MCP only. Consequently fault-injection (`mock_network`) and DevTools
console/network tracing were not run in this section, and no server log was available to rule out
a client-side-rendered error boundary beyond the DOM checks below.

## Slice manifest — triaged BEFORE reading any PNG

Triage result: **clean**. All 33 route/viewport responses are HTTP 200; every final URL equals
the requested path (no redirects); no body contains error-boundary text
(`application error|something went wrong|an error occurred|digest:|internal server error`);
every console buffer contained exactly one `[HMR] connected` log line and zero errors/asserts/
uncaught exceptions; `document.documentElement.scrollWidth === window.innerWidth` on tablet and
mobile (no horizontal overflow). HMR connect logs are dev-server noise, not application errors.
No infra issue to fix before the vision pass, so the PNGs were read.

| # | Route | Width | Status | Final URL | H1 | Console | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | /deployments | 1280×800 | 200 | /deployments | Deployments | 1 log, 0 err | manage-deployments-1280.png |
| 2 | /deployments | 768×1024 | 200 | /deployments | Deployments | 1 log, 0 err | manage-deployments-768.png |
| 3 | /deployments | 375×812 | 200 | /deployments | Deployments | 1 log, 0 err | manage-deployments-375.png |
| 4 | /agent | 1280×800 | 200 | /agent | Agent Workspace | 1 log, 0 err | manage-agent-1280.png |
| 5 | /agent | 768×1024 | 200 | /agent | Agent Workspace | 1 log, 0 err | manage-agent-768.png |
| 6 | /agent | 375×812 | 200 | /agent | Agent Workspace | 1 log, 0 err | manage-agent-375.png |
| 7 | /workflows | 1280×800 | 200 | /workflows | Workflows | 1 log, 0 err | manage-workflows-1280.png |
| 8 | /workflows | 768×1024 | 200 | /workflows | Workflows | 1 log, 0 err | manage-workflows-768.png |
| 9 | /workflows | 375×812 | 200 | /workflows | Workflows | 1 log, 0 err | manage-workflows-375.png |
| 10 | /workflows/workflow-incident-published | 1280×800 | 200 | same | Sample incident response | 1 log, 0 err | manage-workflow-incident-published-1280.png |
| 11 | /workflows/workflow-incident-published | 768×1024 | 200 | same | Sample incident response | 1 log, 0 err | manage-workflow-incident-published-768.png |
| 12 | /workflows/workflow-incident-published | 375×812 | 200 | same | Sample incident response | 1 log, 0 err | manage-workflow-incident-published-375.png |
| 13 | /workflows/workflow-incident-draft | 1280×800 | 200 | same | Sample incident response draft | 1 log, 0 err | manage-workflow-incident-draft-1280.png |
| 14 | /workflows/workflow-incident-draft | 768×1024 | 200 | same | Sample incident response draft | 1 log, 0 err | manage-workflow-incident-draft-768.png |
| 15 | /workflows/workflow-incident-draft | 375×812 | 200 | same | Sample incident response draft | 1 log, 0 err | manage-workflow-incident-draft-375.png |
| 16 | /workflows/workflow-invalid | 1280×800 | 200 | same | Sample incomplete workflow | 1 log, 0 err | manage-workflow-invalid-1280.png |
| 17 | /workflows/workflow-invalid | 768×1024 | 200 | same | Sample incomplete workflow | 1 log, 0 err | manage-workflow-invalid-768.png |
| 18 | /workflows/workflow-invalid | 375×812 | 200 | same | Sample incomplete workflow | 1 log, 0 err | manage-workflow-invalid-375.png |
| 19 | /integrations | 1280×800 | 200 | /integrations | Integrations | 1 log, 0 err | manage-integrations-1280.png |
| 20 | /integrations | 768×1024 | 200 | /integrations | Integrations | 1 log, 0 err | manage-integrations-768.png |
| 21 | /integrations | 375×812 | 200 | /integrations | Integrations | 1 log, 0 err | manage-integrations-375.png |
| 22 | /credentials | 1280×800 | 200 | /credentials | Credentials | 1 log, 0 err | manage-credentials-1280.png |
| 23 | /credentials | 768×1024 | 200 | /credentials | Credentials | 1 log, 0 err | manage-credentials-768.png |
| 24 | /credentials | 375×812 | 200 | /credentials | Credentials | 1 log, 0 err | manage-credentials-375.png |
| 25 | /settings/project | 1280×800 | 200 | /settings/project | Project settings | 1 log, 0 err | manage-settings-project-1280.png |
| 26 | /settings/project | 768×1024 | 200 | /settings/project | Project settings | 1 log, 0 err | manage-settings-project-768.png |
| 27 | /settings/project | 375×812 | 200 | /settings/project | Project settings | 1 log, 0 err | manage-settings-project-375.png |
| 28 | /settings/organization | 1280×800 | 200 | /settings/organization | Organization settings | 1 log, 0 err | manage-settings-organization-1280.png |
| 29 | /settings/organization | 768×1024 | 200 | /settings/organization | Organization settings | 1 log, 0 err | manage-settings-organization-768.png |
| 30 | /settings/organization | 375×812 | 200 | /settings/organization | Organization settings | 1 log, 0 err | manage-settings-organization-375.png |
| 31 | /settings/account | 1280×800 | 200 | /settings/account | Account settings | 1 log, 0 err | manage-settings-account-1280.png |
| 32 | /settings/account | 768×1024 | 200 | /settings/account | Account settings | 1 log, 0 err | manage-settings-account-768.png |
| 33 | /settings/account | 375×812 | 200 | /settings/account | Account settings | 1 log, 0 err | manage-settings-account-375.png |

Heading structure captured per shot via a11y snapshot + DOM `h1/h2/h3`; condensed snapshots were
retained for every shot during the sweep (all pages expose a single `h1` matching the table, plus
the expected `Agent` landmark heading).

## Functional results and findings

### Coverage summary

- 11 routes × 3 widths = **33/33 captures**: all HTTP 200, no redirects, expected single `h1`,
  zero console errors (only `[HMR] connected` dev logs), no error-boundary text.
- **33/33 PNGs read** for vision review after the manifest triage above.
- Functional result counts: **passed 17, failed 1, blocked 2** (blockers are tooling/scope, not app
  defects). No application code, other docs or server state was changed; no real mutation or API
  call was made.

### Functional matrix (read-only interactions)

| Surface / control | Before → after | URL | Evidence | Width | State |
| --- | --- | --- | --- | --- | --- |
| Deployments search "zzz" | 2 rows → 0 rows + "No deployments match these filters" | /deployments | DOM + `manage-deployments-*` | 1280 | Pass |
| Deployments Environment=Sandbox | 2 rows → 0 rows + designed empty state; Clear restores 2 | /deployments | DOM | 1280 | Pass |
| Deployments Status=Running | 2 rows → 1 row | /deployments | DOM | 1280 | Pass |
| Integrations search "zzz" | 3 rows → 0 rows + "No integrations match these filters" | /integrations | DOM snapshot | 1280 | Pass |
| Credentials search "zzz" | 4 rows → 0 rows + designed empty state | /credentials | DOM snapshot | 1280 | Pass |
| Table horizontal scroll | clipped columns scroll inside `overflow-x:auto` wrapper (scrollLeft 0→200) | /deployments | DOM, wrapper scrollW 960 / clientW 500 | 768 | Pass |
| Global Agent sheet open/close | button → modal dialog with focus on dialog; Escape closes | /overview | DOM snapshot + focus probe | 1280 | Pass |
| Global sheet Inject context | "Inject context" → "Remove Current page: Overview (sample)" | /overview | DOM snapshot | 1280 | Pass |
| Global sheet local message | typed note → "You (local, not sent)" + "Local only, not sent" notice | /overview | DOM text | 1280 | Pass |
| Global sheet New chat | local note removed | /overview | DOM text | 1280 | Pass |
| Full-screen Agent approval | "Preview task approval" → "Task approval preview" dialog → "Close preview" | /agent | DOM snapshot | 1280 | Pass |
| Full-screen Agent artifact toggle | "Hide artifact" removes panel; "Show artifact" restores it | /agent | DOM text | 1280 | Pass |
| Full-screen Agent context | "Inject context" → "Remove context" | /agent | DOM labels | 1280 | Pass |
| Full-screen Agent local message + New chat | typed note appears; New chat → "Local sample chat cleared" | /agent | DOM text | 1280 | Pass |
| Workflows select draft / invalid | detail pane updates; invalid shows "Add a notification step before publish." | /workflows | DOM snapshot | 1280 | Pass |
| Workflow reorder | selecting "Inspect the sample work item" + "Move later" swaps local order; nothing saved | /workflows/workflow-incident-published | DOM `ol` order | 1280 | Pass |
| Workflow publish preview | dialog: "Nothing was published…" confirmation text | /workflows/workflow-incident-published | DOM text | 1280 | Pass |
| Settings password preview | empty → "Enter both sample values…"; filled → "Simulation only…" | /settings/account | DOM + `manage-fn-password-1280.png` | 1280 | Pass |
| Settings slug preview | invalid → error; valid → "Simulation only: the sample slug shape is valid" | /settings/project | DOM text | 1280 | Pass |
| Settings access-denied preview | button → "Sample access-denied state" banner | /settings/organization | DOM text | 1280 | Pass |
| Mobile navigation | "Open navigation" → dialog with all links → tap Account → `/settings/account` | /deployments | DOM + `manage-fn-mobile-nav-375.png` | 375 | Pass |
| Mobile Agent artifact | "Show artifact" → fullscreen "Artifact context" dialog; Escape closes | /agent | DOM + `manage-fn-mobile-artifact-375.png` | 375 | Pass |
| Full-screen `/agent` layout | conversation usable, single column | /agent | `manage-agent-375.png`, DOM | 375 | Pass |
| Full-screen `/agent` layout | conversation crushed to 19px beside 480px panel | /agent | `manage-agent-768.png`, DOM | 768 | **Fail** (F1) |
| Chrome DevTools MCP fault injection / server log | not available (profile in use) | — | recorded blocker above | all | Blocked |
| Live backend / real mutations / real Agent | out of scope for fixture preview | — | `coverage.md` scope | all | Blocked (not applicable) |

### Findings

**F1 — Failed (big / owner decision), tablet full-screen Agent conversation collapses.**
At 768×1024 the conversation column is only **19 px** wide (text span 12 px, wrapped one letter
per line) while the artifact panel keeps its fixed width. Evidence:
`manage-agent-768.png`; DOM at 768: `StackItem` for the conversation has
`x=268, width=19`, artifact panel starts at `x=300`. Source:
`apps/console/src/app/agent/page.tsx:36` narrow cutoff is `max-width: 767px`, so 768 px takes the
desktop branch; `:93` gives the artifact `Card` `width={artifactResize.size}` (default 480,
`minSize` 360 from `:37`); `:128` renders that panel next to the chat whenever `!isNarrow`.
With a 260 px sidebar, 768 − 260 − 480 leaves ~28 px for the chat. `DESIGN.md:88-89` sets the
`lg` breakpoint at 1024 and says contextual content sits beside the conversation only when both
remain usable, otherwise a full-height overlay (which the page already implements for
`isNarrow` at `:134-151`). Recommendation: raise the panel-overlay cutoff to below 1024 px
rather than below 768 px. Layout restructure, so it is reported rather than changed.

### Verified-not-bugs (do not rediscover)

- Tables are clipped at 768/375 but live inside `.astryx-table-scroll-wrapper` with
  `overflow-x:auto` and a working horizontal scroll (`scrollLeft` 0→200); `docW === winW` on every
  tablet/mobile shot. This follows `DESIGN.md:90`.
- The apparent stale validation copy on `/settings/project` is a 1×1 clipped `aria-live` region
  from Astryx, not visible UI.
- Status pills always carry a text label; disabled controls (Move earlier/later, Send) keep their
  button silhouette; empty values render as "—"; fixture notices and disabled/planned actions are
  intentional.
- The small "N" badge at bottom-left is the Next.js dev-tools overlay, not application UI.

### Artifact paths

- Report: `docs/qa/console/runs/2026-11-28/agent-manage.md`
- Screenshots: `docs/qa/console/runs/2026-11-28/screenshots/manage-*.png` (36 files: 33 route
  shots + 3 functional-state shots, copied with `cp -n`)
- Private capture temp: `/private/var/folders/gs/h6f9nkc50716wx9vzfr70mt00000gn/T/opencode/manage-qa-shots/`

## Append — corrective breakpoint fix and recheck (same worker)

### Fix (F1 resolved)

- Changed only `apps/console/src/app/agent/page.tsx:36`:
  `useMediaQuery('(max-width: 767px)', true)` → `useMediaQuery('(max-width: 1023px)', true)`.
  The existing fullscreen `Dialog` overlay and desktop split branches were left untouched.
- Regression guard added at `apps/console/src/app/agent/page.test.ts` (7 cases): overlay expected
  at 375/768/900/1023, split expected at 1024/1280/1440. Current source: **7 pass, 0 fail**.
  With the old `767px` query in a temp copy: **3 fail** (768/900/1023), proving the guard catches
  the original regression.
- Scoped gates: `bun fmt` (2 files) clean; `bun lint --no-script --max-warnings=0
  --allow-unsupported <2 files>` no output; `bun check --no-script -p apps/console` =
  "No type errors in 88 files"; `bun test apps/console/src/app/agent/page.test.ts` = 7 pass.
- Original screenshots preserved; new distinct captures copied with `cp -n`:
  `manage-after-agent-768.png`, `manage-after-agent-375.png`, `manage-after-agent-1280.png`.
- Browser evidence after fix: 768 conversation width **19 px → 500 px** and no split panel;
  375 width 375 px; 1280 split intact (chat 531 px + visible artifact panel); 900/1023 take the
  overlay, 1024 takes the split. Overlay opens with `Show artifact`, Escape closes it and returns
  focus to the invoker; composer input and Send stay reachable. Contrast at 768: h1 15.51:1,
  composer 16.27:1, Send 6.06:1, bubble 16.27:1. Console: one `[HMR] connected` log per
  navigation, zero errors. All at HTTP 200 on `/agent`.
- **Change to earlier finding:** F1 (tablet conversation crushed) is reclassified from
  **failed → passed after fix**; it is not an open defect.

### Rechecked prior Agent findings (coordinator request; not changed in this fix)

| Finding | DOM/visual evidence | Classification | State |
| --- | --- | --- | --- |
| Composer below the initial viewport | At 1280×800 composer input `y=884` (viewport 800); at 1440×805 `y=844`. The scrollable `.astryx-layout-content` has `scrollHeight 1014 > clientHeight 800`; after scrolling to `scrollTop 214` the composer is at `y=670` and usable. `manage-agent-1280.png`, `manage-check-composer-scrolled-1280.png` | Presentational/UX: control is reachable by scrolling, but not visible on first paint. Separate from the breakpoint fix; owner decision if it should be pinned in view. | Open (not silently passed) |
| New chat leaves a source-linked artifact panel | After `New chat`: "Local sample chat cleared" is shown, but "Sample change checklist" and `Go to source message` remain; target `#message-message-2` was present before and absent after, so the button has no target and clicking changes nothing. `manage-check-newchat-1280.png` | Behavior inconsistency in local fixture state. Requires component logic, outside this breakpoint fix. | Open (owner decision) |
| Inject context has no visible suggestion in full-screen composer | Before injection the composer text is only "New chat / Hide artifact / Local sample input… / Inject context / …"; no "Suggested context" text. After injection: "Sample work item context added to this preview only." + token. The global sheet does show "Suggested context: Agent page, sample Project Checkout API…" `manage-check-context-1280.png`; `DESIGN.md:20` | Design-spec gap (suggestion copy absent on full screen). Separate behavior change; not fixed here. | Open (owner decision) |

Rule loading for this slice: `agent-rules-mcp` metadata paged to `nextOffset:null`, with `qa`,
`real-user-qa`, `general`, `frontend`, `linting`, `test-audit`, `wf-qa` and the project Astryx skill
consulted; `modern-web-guidance` searched and retrieved before editing.
