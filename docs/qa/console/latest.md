# Console QA: current status

Last sweep: **2026-11-28**. Status: **changes made; review required**. This is the editable summary of current findings. It does not approve the design or authorize API integration.

## Coverage

- [Route and viewport matrix](runs/2026-11-28/coverage.md): 24 URLs, including the home redirect and fixture-specific detail routes, at 1280 × 800, 768 × 1024, and 375 × 812.
- [Access, Overview, and Work items report](runs/2026-11-28/access-work.md): route and console results, screenshots, and interaction checks.
- [Agent, workflows, and management report](runs/2026-11-28/agent-manage.md): route and console results, screenshots, and interaction checks.
- [Screenshots](runs/2026-11-28/screenshots/): original and separately named after-fix captures. Route manifests in the section reports map each filename to a URL and width.

The 72 initial route/viewport checks returned the expected page or redirect, expected heading, and no unexpected console errors. The original tablet Agent screenshot nevertheless exposed a serious visual failure, now fixed below. Selected interactions were tested, but **not every control and state at every width**. Full-page screenshots do not capture everything in independently scrolling panels; the access report includes additional scrolled captures where recorded.

## Fixed in this sweep

| Finding | Result | Evidence |
| --- | --- | --- |
| Agent conversation collapsed to 19 px at 768 px beside the artifact panel | Existing fullscreen artifact overlay now applies below 1024 px; desktop split remains at 1024 px and above. | [Before](runs/2026-11-28/screenshots/manage-agent-768.png), [after](runs/2026-11-28/screenshots/manage-after-agent-768.png), [recheck details](runs/2026-11-28/agent-manage.md#append--corrective-breakpoint-fix-and-recheck-same-worker) |
| Work item count said “1 sample work items” | Singular and plural labels now match the count. | [Before](runs/2026-11-28/screenshots/access-work-items-1280-one-result.png), [after](runs/2026-11-28/screenshots/access-fixed-work-items-1280-one-result.png) |
| Priority cell announced “High High” | Decorative status dot is hidden from assistive technology; the adjacent text supplies the label. | [ARIA recheck](runs/2026-11-28/access-work.md#fix-2--duplicate-accessible-priority-name-f2) |

## Remaining issues

All rows are open. The two section reports contain the original observations and DOM or source evidence.

| Priority | Bucket | Issue and next decision |
| --- | --- | --- |
| High | Accessibility | Onboarding validation does not announce or associate errors with the affected field, and focus remains on Next. Define an accessible error and focus pattern. [Evidence](runs/2026-11-28/access-work.md#recheck-of-the-previous-review-recorded-only-no-larger-changes) |
| High | UX / layout | The full-screen Agent composer starts below the viewport at desktop and requires scrolling before input. Decide how to keep it directly accessible without hiding the conversation. [Evidence](runs/2026-11-28/agent-manage.md#rechecked-prior-agent-findings-coordinator-request-not-changed-in-this-fix) |
| Medium | Behavior | New chat clears messages but leaves an artifact whose source message no longer exists. Decide how to clear or detach the artifact with the conversation. [Evidence](runs/2026-11-28/agent-manage.md#rechecked-prior-agent-findings-coordinator-request-not-changed-in-this-fix) |
| Medium | Design spec | The full-screen Agent does not show the suggested context before Inject context, unlike the global sheet. [Evidence](runs/2026-11-28/agent-manage.md#rechecked-prior-agent-findings-coordinator-request-not-changed-in-this-fix) |
| Medium | Forms | Sign-in and registration previews accept malformed nonempty email addresses. [Evidence](runs/2026-11-28/access-work.md#recheck-of-the-previous-review-recorded-only-no-larger-changes) |
| Medium | Accessibility | Console shell pages expose nested `main` landmarks. Public access pages checked have one. [Evidence](runs/2026-11-28/access-work.md#recheck-of-the-previous-review-recorded-only-no-larger-changes) |

The prior direct UI review also identified a visually ambiguous Work items status filter, filter state missing from the URL, a mobile workflow inspector far below the selected row, workflow selection without an exposed selected state, and an onboarding heading that promises Organization selection without a selection control. These are **needs recheck**, not closed by the screenshot sweep.

## Checks after fixes

| Check | Result |
| --- | --- |
| `bun fmt --check apps/console` | Pass |
| `bun lint --no-script --max-warnings=0 --allow-unsupported apps/console` | Pass |
| `bun run --filter @graveshift/console typecheck` | Pass, 88 files |
| `bun test apps/console/src/fixtures apps/console/src/app/agent/page.test.ts` | Pass, 31 tests |
| `bun run --filter @graveshift/console build` | Pass |
| `bunx astryx doctor` in `apps/console` | 26 pass, 0 warnings, 0 failures; Core prop check was not performed because the installed TypeScript 7 lacks its JavaScript compiler API. |

The breakpoint regression test checks the declared source query and branches; it is not a browser-level regression test. The live browser recheck supplies separate visual and interaction evidence.

## Scope and blockers

- The app is a **fixture-only preview**. Sign-in, Agent responses, persistence, live API calls, real mutations, authorization, and workflow publishing were not tested and are not claimed to work. API fault injection and seeded database checks are not applicable until those surfaces exist.
- Chrome DevTools MCP could not start because its browser profile was already in use. The sweep used the connected `browse` browser for response status, console, DOM, interaction, and screenshots; it did not run Chrome DevTools network mocks or traces.
- The coordinator inspected the tee'd development-server log: route requests succeeded, the intentionally invalid Work item returned 404, and no runtime exception was found. The log remains in temporary storage, not in this report.
- Horizontal table scrolling was verified inside the table container. Whether its discoverability and mobile information density are acceptable remains a design-review question, not an automated pass.
- Root-wide checks were not rerun as part of this console-scoped sweep. Previously reported unrelated security-audit formatting failures were not changed.
