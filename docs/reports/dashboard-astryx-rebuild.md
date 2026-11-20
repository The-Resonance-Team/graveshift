# Dashboard rebuild on Astryx (2026-11-20)

The Graveshift dashboard now uses Astryx components, Astryx page-template frames and a custom theme that extends Gothic. No component is hand-rolled from raw `div`/`span` layout.

## What changed

- Theme: `apps/dashboard/src/themes/graveshift/graveshiftTheme.ts` extends `@astryxdesign/theme-gothic` and maps the design palette to Astryx color tokens. It is built with `astryx theme build` and wired through the generated `src/astryx-themes.ts`. Reduced-motion adaptation sets fast and medium durations to `0ms`.
- App root: `Theme` (`mode="dark"`), `LinkProvider` (Next.js `Link`), and `QueryClientProvider` are composed in `src/app/providers.tsx`. `globals.css` imports Astryx base/theme CSS in the documented cascade-layer order and keeps the Tailwind palette tokens asserted by `dashboard.test.ts`.
- Home page frame follows the Astryx dashboard layout: `Layout` + `LayoutHeader` + `LayoutContent` + `LayoutPanel`. Below 1024 px the controls panel folds into the content column, matching the Astryx responsive contract.
- Service grid: `Grid` + `Card` + `StatusDot` + `Heading` + `Text`, with `EmptyState` and `Button` for loading/error/empty states.
- Incident list: the Incident Console pattern — severity `StatusDot`, state and PR `Token`s, a `SegmentedControl` for Open/All, and `List`/`ListItem` rows with `Timestamp`.
- Incident detail: Astryx `Stepper` for the five phases, `Card` for diagnosis and Exorcism, `List` for evidence and the event timeline, and an external `Link` for the draft PR.
- First run: Astryx `Stepper` + `Button`. Fault injection: `RadioList` + `Button`. Every themed label uses Astryx `Tooltip` with keyboard focus support.

## Verification

| Check | Result |
| ----- | ------ |
| `bun run verify` | 240 pass, 0 fail |
| `bun run lint --no-script --max-warnings=0 --allow-unsupported` | pass (two scoped overrides: generated theme file, Astryx JSX slot props) |
| `bun check --no-script` | no type errors |
| `bun run build` in `apps/dashboard` | compiled, 4 routes |
| `astryx doctor --built .` | 19 pass, 0 fail; warnings are external font imports and stylistic suggestions |
| Dashboard at 375 / 768 / 1440 px | one `h1`, no horizontal overflow, controls fold below content under 1024 px |
| Incident detail in Chrome | phase stepper, diagnosis tokens, evidence and timeline rendered from live daemon data |
| Browser console | no errors on a clean load with reduced motion enabled |
| Reduced motion emulation | `prefers-reduced-motion: reduce` active; no premature animation |

Live evidence: Compose stack on ports 2600/2602, dashboard on 2604 through the `/api/*` proxy, `null-candy` haunt produced `code_bug` (95%, llm). Screenshots were taken at each viewport; the stack was stopped after the pass.

## Deviations

- The generated theme JS is 550 lines and the generated theme module must stay byte-identical to CLI output. Both are excluded from formatting; the JS also has a scoped `max-lines` override.
- Build prints a CSS warning because Gothic's font stylesheet uses an external `@import` after `@layer` rules. Fonts load; no local font assets were added.
- `astryx doctor` suggests avoiding JSX slot props and the import of `globals.css`. Both are required by the app entry and by Astryx's `Layout`/`TopNav` slot API.
