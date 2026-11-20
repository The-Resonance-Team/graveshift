# Design system

This file holds aesthetic tokens, accessibility rules and the user-facing copy contract. `GLOSSARY.md` holds domain concepts only.

## Palette

| Token | Hex | Meaning |
| --- | --- | --- |
| Night | `#0b0f14` | Background |
| Ectoplasm | `#7CFFB2` | Healthy |
| Pumpkin | `#FF7A1A` | Warning |
| Blood | `#E5484D` | Critical |

Neutral tokens used by the dashboard (`globals.css`, `@theme inline`):

| Token | Hex | Meaning |
| --- | --- | --- |
| Crypt | `#10151c` | Card and panel surface |
| Mist | `#232d3a` | Borders and hover surface |
| Bone | `#e6edf3` | Primary text |
| Fog | `#a3adbb` | Secondary text |

Contrast pairs checked by the dashboard test suite: Bone, Fog, Ectoplasm, Pumpkin and Blood text on Night and Crypt; Bone and Fog on Mist; Night text on Pumpkin and Ectoplasm buttons. Every pair is at least 4.5:1. Status colours (Ectoplasm, Pumpkin, Blood) never sit on Mist, because Blood on Mist is below 4.5:1; hover states on status cards darken to Night instead.

## Voice

Playful and spooky, never cryptic. Use the pattern “themed phrase — plain meaning”. Every themed label has a plain tooltip.

## Accessibility

- Text contrast at least 4.5:1.
- Respect `prefers-reduced-motion`.
- No flashing animation.

## Term table

Internal term | Displayed (EN) | Displayed (VI) | Plain meaning (EN)
--- | --- | --- | ---
service | Grave | Ngôi mộ | A watched service
healthy | Resting in peace | Đang yên nghỉ | Service is healthy
incident | Haunting | Ám ảnh | An incident
crash loop | Restless spirit | Hồn không yên | Repeated restarts
OOM | Drained by a leech | Bị ma sóc hút sạch | Out-of-memory termination
fix PR | Exorcism | Lễ trừ tà | Draft pull request with a fix
approve | Bless | Ban phước | Approve a runtime action
reject | Banish | Trục xuất | Reject a runtime action
silence | Salt line | Vòng muối | Silence signals for a service
postmortem | Autopsy | Khám nghiệm | Postmortem report
dashboard | Graveyard | Nghĩa địa | Dashboard that shows every watched service
diagnosis | Diagnosis | Chẩn đoán | Stated root cause with evidence and confidence
audit log | Audit chain | Chuỗi kiểm toán | Ordered, tamper-evident record of decisions
agent | Ghost | Hồn ma | An AI agent in the crew
watcher | Wraith | Ma theo dõi | The ghost that watches signals
diagnoser | Medium | Thầy đồng | The ghost that builds a diagnosis
fixer | Exorcist | Thầy trừ tà | The ghost that prepares a draft fix pull request
notifier | Banshee | Ma khóc | The ghost that notifies people and collects approvals

## Responsive rules

- Supported widths: 375 px (mobile), 768 px (tablet), 1024 to 1440 px (desktop). Layout uses CSS breakpoints only (`sm:` 640, `lg:` 1024, `xl:` 1280); no `window.innerWidth` state.
- Graveyard grid: 1 column below 640 px, 2 from 640 px, 3 from 1024 px, 4 from 1280 px.
- Home page: one column below 1024 px, with the controls (mode, Haunt panel, audit chain) stacked after the graves and incidents. From 1024 px the controls move to a right-hand column one third wide.
- Incident timeline: the five phase cards form 2 columns below 640 px and one row of 5 from 640 px.
- Content width caps at `max-w-7xl`. Long values (commands, branch names) scroll inside their block with `overflow-x-auto` instead of widening the page.
- Every control stays reachable below 1024 px; the dashboard has no hidden navigation.

## Icon vocabulary

- The dashboard ships no icons. Status is shown with a coloured dot (`aria-hidden`) next to a text label, so meaning never depends on colour or a glyph alone.
- No Unicode glyphs or emoji as icons (`✓`, `→`, `☠`). Separators in UI text are commas.
- When icons are needed, add one concept-keyed registry (`ICON.<concept>`, for example `ICON.incident`, `ICON.healthy`, `ICON.fixPr`) in a shared UI package, keyed by the internal terms of the Term table. Icons are `aria-hidden`, and icon-only buttons carry an `aria-label`. Do not add per-component icon sets.
