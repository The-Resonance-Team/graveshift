# Console QA coverage: 2026-11-28

Status: route rendering and the recorded fixture interactions were checked; the full workflow has coverage gaps. The [current summary](../../latest.md) lists the remaining issues and limits.

## Scope

The console uses deterministic in-memory fixtures. It does not sign users in, connect to an API, write to a database, or run an Agent. Database setup, seeded authentication, live mutations, and API fault injection are not applicable to this preview and must be tested when those integrations exist.

No prior `docs/qa` report or screenshot sweep exists. All console pages are new, uncommitted work; there are no console commits in `git log --since=2026-11-27`. Every page therefore receives equal attention.

Target: `apps/console`, local fixture server on port 3217. Viewports: desktop 1280 × 800, tablet 768 × 1024, mobile 375 × 812.

## Route and viewport matrix

Each cell records a route-render check, not a blanket pass for every interaction or visual state. The linked section reports contain the final URL, heading, response, console result, and screenshot filename for each cell.

| Route | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| `/` redirect | Pass | Pass | Pass |
| `/sign-in` | Pass | Pass | Pass |
| `/register` | Pass | Pass | Pass |
| `/onboarding` | Pass | Pass | Pass |
| `/overview` | Pass | Pass | Pass |
| `/work-items` | Pass | Pass | Pass |
| `/work-items/work-done` | Pass | Pass | Pass |
| `/work-items/work-auto-agent` | Pass | Pass | Pass |
| `/work-items/work-manual-agent` | Pass | Pass | Pass |
| `/work-items/work-saved-question` | Pass | Pass | Pass |
| `/work-items/work-failed` | Pass | Pass | Pass |
| `/work-items/work-no-draft-pr` | Pass | Pass | Pass |
| `/work-items/work-human` | Pass | Pass | Pass |
| `/deployments` | Pass | Pass | Pass |
| `/agent` | Pass | Pass; layout fixed | Pass |
| `/workflows` | Pass | Pass | Pass |
| `/workflows/workflow-incident-published` | Pass | Pass | Pass |
| `/workflows/workflow-incident-draft` | Pass | Pass | Pass |
| `/workflows/workflow-invalid` | Pass | Pass | Pass |
| `/integrations` | Pass | Pass | Pass |
| `/credentials` | Pass | Pass | Pass |
| `/settings/project` | Pass | Pass | Pass |
| `/settings/organization` | Pass | Pass | Pass |
| `/settings/account` | Pass | Pass | Pass |

See [access and Work items evidence](access-work.md#route--viewport-manifest) and [Agent and management evidence](agent-manage.md#slice-manifest--triaged-before-reading-any-png). The original tablet Agent screenshot records a visual failure; [the recheck](agent-manage.md#append--corrective-breakpoint-fix-and-recheck-same-worker) records the fix and after captures.

## Functional and exception targets

| Surface | Target |
| --- | --- |
| Navigation | Desktop sidebar; mobile menu and route change; unknown detail 404 |
| Access | Sign-in and registration validation and preview; onboarding required-password and no-password paths; back, locked future step, deferred source |
| Work items | Search, status filter, empty response, saved question, failed and retry states |
| Agent | Global sheet open/close and keyboard focus; context injection and removal; local message and new chat; full-screen artifact, approval preview and new chat |
| Workflows | Select published/draft/invalid, inspect validation, reorder locally, preview publish confirmation |
| Deployments, integrations, credentials | Search/filter, empty state and disabled actions |
| Settings | Each section and sample password validation |

The results for these targets are in the functional matrices in [access-work.md](access-work.md#functional-results-real-user-pass) and [agent-manage.md](agent-manage.md#functional-results-and-findings). Not every control was exercised at every width. No real mutation was authorized. API failure injection, real authentication, and live mutation checks remain not applicable until the preview is connected to a backend.
