# Console QA — independent access/work-items sweep (2026-11-28)

Reviewer: dispatched worker `task_8068896bb406`, tab owner `access-qa` (group `access-qa-20261128`).
Target: `http://localhost:3217` (coordinator-owned server; never stopped/restarted).
Source of truth: `DESIGN.md`, `docs/qa/console/runs/2026-11-28/coverage.md`, rules `qa`, `real-user-qa`, `general` and workflow `wf-qa` via `agent-rules-mcp`.
Scope: `/` redirect, `/sign-in`, `/register`, `/onboarding`, `/overview`, `/work-items` and the seven `/work-items/{work-done,work-auto-agent,work-manual-agent,work-saved-question,work-failed,work-no-draft-pr,work-human}` pages at 1280×800, 768×1024, 375×812.

## Method and evidence handling

- One browse MCP tab owned by me (`access-qa`); I did not touch the relay's `console-qa-20261128` tab or any other reviewer's tab/files.
- Viewport emulation per shot (`mobile:true` only at 375 px), `colorScheme:"dark"`; console capture started before the first navigation and drained per shot.
- Per route/width: HTTP status, final URL, rendered H1/H2, body scan for error-boundary strings, per-shot console errors, document width check, and a full-page screenshot.
- Initial screenshots were written with `scale:"css"`, which the relay halves (640×400 at a 1280 viewport). All 39 were re-captured with `scale:"device"` (true 1:1) and copied over my own files. Final evidence in `screenshots/` is 1:1 PNG.
- Temporary capture folder: `/var/folders/gs/h6f9nkc50716wx9vzfr70mt00000gn/T/opencode/access-qa-shots`; copied into `screenshots/` with unique `access-` prefix using `cp -n` first, then overwriting only my own `access-*` files. 54 `access-*` files total; other reviewers' `manage-*` files were left untouched.
- **Manifest triage was completed before any PNG was read** (see below). Then all 86 images available at that point were read (39 primary + 14 scrolled-bottom + the earlier 0.5-scale bottom set, which was discarded/replaced after review), plus the extra singular-count shot. Dense detail pages scroll inside `.astryx-layout-content` / `.astryx-layout-panel`, so 14 genuine scrolled-bottom captures were added at 1280 and 375.
- Full-page captures at these widths equal the viewport (document height ≈ viewport height); lower content is covered by the `*-bottom.png` captures. Unreadable/tiny copy would be marked low-confidence; none of the reported findings relies on unreadable pixels.

## Manifest triage (before vision review)

| Check | Result |
| --- | --- |
| Captures | 39/39 route × width shots succeeded; 0 zero-byte files |
| HTTP status | 39 × 200; `/` is a 307 redirect to `/overview` at all three widths |
| Final URLs | All matched the requested route; only `/` intentionally ends at `/overview` (1 redirect) |
| Error-boundary text | 0 occurrences of "application error / client-side exception / something went wrong / digest / exception has occurred" |
| Console errors | 0 errors across all 39 shots |
| Horizontal overflow | `document.documentElement.scrollWidth === viewport width` at all three widths |
| Watchlist resolved in DOM before reading PNGs | numeric H2 stat cards have visible labels; `High High` in the a11y tree is a labelled dot + adjacent text; work-items table is inside `.astryx-table-scroll-wrapper` with `overflow-x:auto`; mobile onboarding has 3 steps and a second icon-only step control; `Open navigation` exists on all mobile pages |

## Route × viewport manifest

All rows: status 200, zero console errors, zero error-boundary text, final URL = requested URL except `/` → `/overview`. Screenshot paths are relative to `docs/qa/console/runs/2026-11-28/`.

| Route | Width | Final URL / status | H1 (rendered heading) | Screenshot |
| --- | --- | --- | --- | --- |
| `/` | 1280 | `/overview`, 307→200 | Overview | `screenshots/access-root-redirect-1280.png` |
| `/` | 768 | `/overview`, 307→200 | Overview | `screenshots/access-root-redirect-768.png` |
| `/` | 375 | `/overview`, 307→200 | Overview | `screenshots/access-root-redirect-375.png` |
| `/sign-in` | 1280 | `/sign-in`, 200 | Sign in | `screenshots/access-sign-in-1280.png` |
| `/sign-in` | 768 | `/sign-in`, 200 | Sign in | `screenshots/access-sign-in-768.png` |
| `/sign-in` | 375 | `/sign-in`, 200 | Sign in | `screenshots/access-sign-in-375.png` |
| `/register` | 1280 | `/register`, 200 | Create an account | `screenshots/access-register-1280.png` |
| `/register` | 768 | `/register`, 200 | Create an account | `screenshots/access-register-768.png` |
| `/register` | 375 | `/register`, 200 | Create an account | `screenshots/access-register-375.png` |
| `/onboarding` | 1280 | `/onboarding`, 200 | Set up your workspace | `screenshots/access-onboarding-1280.png` |
| `/onboarding` | 768 | `/onboarding`, 200 | Set up your workspace | `screenshots/access-onboarding-768.png` |
| `/onboarding` | 375 | `/onboarding`, 200 | Set up your workspace | `screenshots/access-onboarding-375.png` |
| `/overview` | 1280 | `/overview`, 200 | Overview | `screenshots/access-overview-1280.png` |
| `/overview` | 768 | `/overview`, 200 | Overview | `screenshots/access-overview-768.png` |
| `/overview` | 375 | `/overview`, 200 | Overview | `screenshots/access-overview-375.png` |
| `/work-items` | 1280 | `/work-items`, 200 | Work items | `screenshots/access-work-items-1280.png` |
| `/work-items` | 768 | `/work-items`, 200 | Work items | `screenshots/access-work-items-768.png` |
| `/work-items` | 375 | `/work-items`, 200 | Work items | `screenshots/access-work-items-375.png` |
| `/work-items/work-done` | 1280 | …/work-done, 200 | Sample completed checkout fix | `screenshots/access-work-done-1280.png` |
| `/work-items/work-done` | 768 | …/work-done, 200 | Sample completed checkout fix | `screenshots/access-work-done-768.png` |
| `/work-items/work-done` | 375 | …/work-done, 200 | Sample completed checkout fix | `screenshots/access-work-done-375.png` |
| `/work-items/work-auto-agent` | 1280 | …/work-auto-agent, 200 | Sample automatic memory fix | `screenshots/access-work-auto-agent-1280.png` |
| `/work-items/work-auto-agent` | 768 | …/work-auto-agent, 200 | Sample automatic memory fix | `screenshots/access-work-auto-agent-768.png` |
| `/work-items/work-auto-agent` | 375 | …/work-auto-agent, 200 | Sample automatic memory fix | `screenshots/access-work-auto-agent-375.png` |
| `/work-items/work-manual-agent` | 1280 | …/work-manual-agent, 200 | Sample manual timeout fix | `screenshots/access-work-manual-agent-1280.png` |
| `/work-items/work-manual-agent` | 768 | …/work-manual-agent, 200 | Sample manual timeout fix | `screenshots/access-work-manual-agent-768.png` |
| `/work-items/work-manual-agent` | 375 | …/work-manual-agent, 200 | Sample manual timeout fix | `screenshots/access-work-manual-agent-375.png` |
| `/work-items/work-saved-question` | 1280 | …/work-saved-question, 200 | Sample saved Environment question | `screenshots/access-work-saved-question-1280.png` |
| `/work-items/work-saved-question` | 768 | …/work-saved-question, 200 | Sample saved Environment question | `screenshots/access-work-saved-question-768.png` |
| `/work-items/work-saved-question` | 375 | …/work-saved-question, 200 | Sample saved Environment question | `screenshots/access-work-saved-question-375.png` |
| `/work-items/work-failed` | 1280 | …/work-failed, 200 | Sample failed patch generation | `screenshots/access-work-failed-1280.png` |
| `/work-items/work-failed` | 768 | …/work-failed, 200 | Sample failed patch generation | `screenshots/access-work-failed-768.png` |
| `/work-items/work-failed` | 375 | …/work-failed, 200 | Sample failed patch generation | `screenshots/access-work-failed-375.png` |
| `/work-items/work-no-draft-pr` | 1280 | …/work-no-draft-pr, 200 | Sample publication needs retry | `screenshots/access-work-no-draft-pr-1280.png` |
| `/work-items/work-no-draft-pr` | 768 | …/work-no-draft-pr, 200 | Sample publication needs retry | `screenshots/access-work-no-draft-pr-768.png` |
| `/work-items/work-no-draft-pr` | 375 | …/work-no-draft-pr, 200 | Sample publication needs retry | `screenshots/access-work-no-draft-pr-375.png` |
| `/work-items/work-human` | 1280 | …/work-human, 200 | Sample human investigation | `screenshots/access-work-human-1280.png` |
| `/work-items/work-human` | 768 | …/work-human, 200 | Sample human investigation | `screenshots/access-work-human-768.png` |
| `/work-items/work-human` | 375 | …/work-human, 200 | Sample human investigation | `screenshots/access-work-human-375.png` |

Additional lower-content evidence (scrolled inner containers, 1:1): `screenshots/access-{work-done,work-auto-agent,work-manual-agent,work-saved-question,work-failed,work-no-draft-pr,work-human}-{1280,375}-bottom.png` (14 files). Singular-count evidence: `screenshots/access-work-items-1280-one-result.png`.

## Functional results (real-user pass)

| Surface / control | Before → after | URL | Result | Evidence |
| --- | --- | --- | --- | --- |
| `/` redirect | bare host → Overview at all widths | `/` → `/overview` | Passed | manifest above |
| Sign-in empty submit | no errors → two field errors | `/sign-in` | Passed | DOM text: "Enter the sample email…" / "Enter a sample password…" |
| Sign-in bad-format email | "not-an-email" accepted | `/sign-in` | N/A by design | Source `sign-in/page.tsx:56-57` checks only non-empty; no format validation claimed |
| Sign-in valid preview | filled → "Sample account preview", badge "No session" | `/sign-in` | Passed | DOM preview card; fixture email `owner@example.com` |
| Sign-in "Required password change preview" | link → Account settings preview | `/settings/account` | Passed | Source `sign-in/page.tsx:139`; page shows Password change: Required |
| Registration empty submit | no error → "Enter the sample email you want to preview." | `/register` | Passed | DOM error text |
| Registration conflict | `owner@example.com` → "This email already exists in the fixture set…" | `/register` | Passed | DOM error text; `register/page.tsx:47-50` |
| Registration valid | `new.person@example.com` → "Sample account preview", "Not created" | `/register` | Passed | DOM; preview uses fixture `new@example.com`, nothing stored (`register/page.tsx:76-95`) |
| Registration back link | present in form state | `/register` | Passed (DOM/snapshot) | Snapshot link "Back to sign-in preview"; not clicked after preview replaces it |
| Onboarding required-password: empty | Next → "Use at least 8 characters…" | `/onboarding` | Passed | Banner "Check this step" |
| Onboarding short password | `short/short` → same min-length error | `/onboarding` | Passed | DOM |
| Onboarding mismatch | `samplepass123/different123` → "The sample passwords do not match." | `/onboarding` | Passed | DOM |
| Onboarding valid password | matching ≥8 → step 2; step 1 "completed", step 3/4 still disabled | `/onboarding` | Passed | Snapshot `Go to step 1: Password, completed` |
| Locked future step | click step 4 → no state change | `/onboarding` | Passed | DOM click on aria-disabled step; `onboarding/page.tsx:136-144` guard |
| Organization invalid slug | `Bad_Slug` → "Use lowercase letters, numbers, and hyphens…" | `/onboarding` | Passed | DOM |
| Project empty | Next → "Select a sample Project." | `/onboarding` | Passed | DOM |
| Project selected → checklist | `Checkout API · 314159265` → "Source: Deferred", "Add a source later" | `/onboarding` | Passed | DOM, step 4 of 4 |
| Preview summary (required path) | summary shows "Password: Change previewed, not saved" / "Source: Deferred" | `/onboarding` | Passed | DOM; no fixture written |
| Non-required password path | switch account to `owner@example.com · no change` → 3 steps, no password inputs, step 1 Organization, `1 of 3` | `/onboarding` | Passed | Snapshot + input types `text,text` |
| Desktop sidebar nav | Overview → Work items (H1 Work items) | `/work-items` | Passed | DOM + URL |
| List row → detail | click "Sample automatic memory fix" → detail H1 | `/work-items/work-auto-agent` | Passed | DOM + URL |
| Unknown detail | HTTP 404 + rendered "404 / This page could not be found." | `/work-items/does-not-exist` | Passed | `navigate` status 404; H1 "404" |
| Work-item search | `memory` → 1 row; `zzzz-no-match` → 0 rows + designed EmptyState | `/work-items` | Passed | DOM row counts 1/0, "No sample work items match these filters" |
| Status filter | `Done` → 1 row | `/work-items` | Passed | DOM row count 1 |
| Clear filters | → 7 rows | `/work-items` | Passed | DOM row count 7 |
| Fixture empty response | `Empty sample response` → 0 rows + EmptyState | `/work-items` | Passed | DOM; "This view reads fixtures only. No API request was made." |
| Mobile menu | `Open navigation` → dialog with 11 links; click Work items → `/work-items`, dialog closed | `/overview` → `/work-items` | Passed | ARIA snapshot `dialog "Navigation" [open=true]`; after-nav `dialogOpen:false` |
| Saved-question state | "Waiting for an answer", `question-environment-1`, "Approval required"; `Answer saved question` aria-disabled | `/work-items/work-saved-question` | Passed | DOM; `sections.tsx:277-279` unconditionally `isDisabled` |
| Failed state | "Fix attempt failed before it opened a draft pull request"; Fix now aria-disabled | `/work-items/work-failed` | Passed | DOM + source |
| Retry / no-draft-PR state | "Publication outcome uncertain … Check it before any retry"; Fix now aria-disabled | `/work-items/work-no-draft-pr` | Passed | DOM + source |
| Real mutation / API | none performed; all action buttons unconditionally disabled | — | N/A | `sections.tsx:277-279`; fixture-only preview |

Console: the only error recorded during the entire interactive session was the expected network 404 from the deliberate `/work-items/does-not-exist` probe. All 39 sweep shots had zero console errors.

## Findings (verified in DOM/source, not from pixels alone)

1. **F1 — minor copy: singular count uses plural noun.** With one result (status filter `Done`, or search `memory`), the work-items count reads "1 sample work items". Verified in DOM (`textContent === "1 sample work items"`) and in source `apps/console/src/app/work-items/page.tsx:186` (`{rows.length} sample work items`). Evidence: `screenshots/access-work-items-1280-one-result.png`. Triage: small/presentational copy fix; pluralise conditionally or use a neutral label.
2. **F2 — minor a11y: duplicate accessible name on priority cells.** Playwright ARIA snapshot of the priority cell is `cell "High High": img "High", generic: High`. Cause: `apps/console/src/app/work-items/page.tsx:80-81` passes `label={priorityLabel(...)}` to `StatusDot` and renders the same label as adjacent `Text`. `DESIGN.md:96` requires icons to be `aria-hidden` when a text label is present. Visually only one "High" appears (`screenshots/access-work-items-1280.png`); this is confirmed by DOM, not pixel inference. Triage: small presentational fix (drop the dot's label or mark it decorative).

## Verified-not-bugs / retracted visual concerns

- **Work-items table clipped at the right edge** (screenshots show "Fix que…" and the draft-PR column off-screen): not a bug. `document.querySelector('.astryx-table-scroll-wrapper')` has `overflow-x:auto` and `scrollWidth 1240` at all three widths; scrollbars are visible in the scrolled captures. Complies with `DESIGN.md:90`.
- **Overview numeric H2s (6/2/4/3)**: not unlabelled numbers. Parent text is "Open work items / 6 / 1 of 7 done", "Deployments / 2 / 1 active", etc.; status dots carry `aria-label` alongside text.
- **Mobile onboarding "missing" steps / two button sets**: not a bug. DOM body text contains all four step labels with "unavailable" markers; the icon-only `Previous step`/`Next step` controls are the compact Stepper and the text Back/Next are the form controls (`onboarding/page.tsx:191-206,262-273`).
- **`Open navigation` absent in one compact snapshot**: snapshot auto-scoping artifact. DOM confirms `aria-label="Open navigation"` present on `/work-items/work-saved-question` at 375.
- **Bottom-left "N" bubble overlapping text in mobile screenshots**: Next.js dev-tools overlay, not application UI. Out of scope.
- **"Fix now" reported `disabled:false` by a naive probe**: Astryx `Button` uses `aria-disabled="true"` (not the native attribute); a11y snapshot marks them disabled and they have no handler (`sections.tsx:277-279`). Expected fixture behaviour, not a bug.
- **Fixture data and disabled actions** throughout: expected per `coverage.md:7`; not reported as defects. No real login, backend, or mutation was expected or tested.

## Blocked / not applicable

- **Chrome DevTools MCP blocked**: its server cannot start because the browser profile is already in use. No processes were killed. All work here used the connected `browse` MCP; console/network evidence came from browse's console capture and DOM/network status. This blocks only fault-injection/mocked-exception work (`qa` rule 16, `wf-qa` step 3a), which is in any case N/A for a fixture preview with no live API.
- Fault injection, seeded DB/API smoke tests, and mutation/approval flows: N/A per `coverage.md:7` and the read-only/no-mutation constraint.
- Routes outside my slice (`/deployments`, `/agent`, `/workflows`, `/integrations`, `/credentials`, `/settings/*`): not covered by this independent section; another reviewer owns them. I did not edit `coverage.md`, application code, or any other report file.

## Coverage summary

- Route × viewport matrix: **39/39 passed** (status, final URL, heading, console, screenshot). Redirect expected at `/` only.
- Functional rows: **all listed passed**; 2 findings (F1, F2), both minor and verified in source/DOM; no failed rows; one environmental blocker (Chrome DevTools profile conflict) recorded above.
- Files written: this report only, plus `access-*` PNGs in `docs/qa/console/runs/2026-11-28/screenshots/`.

## Follow-up: two fixes and recheck (task_ce3e0852fc45)

The earlier note above that I did not edit application code applied to the first, read-only sweep. In this follow-up I changed **only** `apps/console/src/app/work-items/page.tsx` (two edits) plus this report and new `access-fixed-*` screenshots. No API, fixture, design, or other document changed.

### Fix 1 — pluralized count (F1)

- Before: `1 sample work items` (DOM text and `screenshots/access-work-items-1280-one-result.png`).
- After: `1 sample work item` with a one-row result; `7 sample work items` when unfiltered. `apps/console/src/app/work-items/page.tsx:190` now renders `{rows.length} sample work item{rows.length === 1 ? '' : 's'}`.
- Evidence: `screenshots/access-fixed-work-items-1280-one-result.png` (distinct file; before shot retained), `screenshots/access-fixed-work-items-1280.png`, `screenshots/access-fixed-work-items-375.png`.

### Fix 2 — duplicate accessible priority name (F2)

- Before ARIA snapshot: `cell "High High": img "High", generic: High`.
- After ARIA snapshot: `cell "High"`; DOM confirms the dot keeps `aria-label="High"` but now has `aria-hidden="true"`, with the adjacent `<Text>` supplying the single spoken label. `apps/console/src/app/work-items/page.tsx:80-84`.
- Astryx styling preserved: still `<StatusDot variant={PRIORITY_DOT[item.priority]}>` with the same variant token, HStack gap and Text; only the forwarded ARIA prop was added. `StatusDotProps` extends Astryx `BaseProps<HTMLSpanElement>` (which keeps `aria-*`) and spreads remaining props onto the dot's `<span>`, so no wrapper node, class override, or API change was needed. `DESIGN.md:96` requires icons to be `aria-hidden` when a text label is present.
- Visual check: after screenshots read at 1280 and 375; coloured dot and "High" appear exactly as before, no clipping or reflow; zero console errors.

### Scoped gates

- `bun fmt apps/console/src/app/work-items/page.tsx` — clean, no unrelated reformatting.
- `bun lint --no-script --max-warnings=0 --allow-unsupported apps/console/src/app/work-items/page.tsx` — clean.
- `bun check --no-script -p apps/console` — "No type errors in 88 files".

### Recheck of the previous review (recorded only, no larger changes)

- **R1 — onboarding validation error announcement/focus (verified issue).** After an invalid Next on step 1, the error is a plain `div.astryx-banner` chain with no `role`, `aria-live` or `aria-atomic`; both password inputs have `aria-invalid` unset and the error text is not linked via `aria-describedby`; `document.activeElement` remains the **Next** button (`apps/console/src/app/onboarding/page.tsx:120-129,236-238`). Left unchanged as a bigger accessibility change.
- **R2 — malformed email accepted (verified issue, not N/A).** `/sign-in` uses `noValidate` and custom validation that only checks non-empty (`apps/console/src/app/sign-in/page.tsx:56-57,109`); `/register` does the same (`register/page.tsx:41-53,97`). DOM check: `input[type=email]` with `not-an-email` has `validity.valid === false` and the native message "Please include an '@' in the email address…", yet submitting shows "Sample account preview". Fixture-only semantics do not remove the UX/form-validation defect; recorded as a remaining issue, not fixed here.
- **R3 — nested main landmarks (verified issue).** `/overview`, `/work-items` and `/work-items/work-done` each expose **two** visible `role="main"` nodes (computed `display:block`, `visibility:visible`, no `aria-hidden`); the ARIA snapshot of the detail page shows an outer `main` containing a second `main`. Sources: Astryx `AppShell` in `apps/console/src/components/console-shell.tsx:116` plus page-level `LayoutContent role="main"` at `overview/page.tsx:236`, `work-items/page.tsx:205`, `work-items/[id]/work-item-view.tsx:82`. `/onboarding` and `/sign-in` each have one main, so the issue is confined to shell pages. Recorded only; no structural refactor performed.

### Modern Web Guidance (guides consulted this turn, verbatim)

- **`html`**: Applied the decorative-icon rule to the priority dot and used the landmark rule for R3 — "DO hide purely decorative SVG images from assistive technology using `aria-hidden="true"`. If using a decorative `<img>`, always include an empty `alt` attribute (e.g. `alt=""`)." / "DON'T use more than one `banner`, `main`, or `contentinfo` landmark per page".
- **`icons`**: Treated the dot as decorative because the adjacent text carries the meaning — "Mark decorative SVGs with `aria-hidden="true"` and give the containing control its own accessible name, as with the CSS icon system."
- **`forms`**: Basis for recording R1 and R2 rather than dismissing them — "DO move focus to the first invalid field (or an error summary) when a form submission fails validation." / "DO use native constraints: `required`, `minlength`, `maxlength`, `pattern`."
- **`accessible-error-announcement`**: Basis for the focus/announcement check in R1 — "After a failed submit, move focus to the first invalid field so that its error is announced instead."
