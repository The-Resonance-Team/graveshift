# Dashboard UI template options (2026-11-20)

Purpose: choose a ready-made UI base to rewrite `apps/dashboard` (the Graveshift "Graveyard"). Four research agents searched v0/Vercel, Astryx, Cloudflare Kumo, UI kit ecosystems, and open-source observability dashboards. All links below were opened and confirmed live on 2026-11-20. Short visual notes come from opening the live sites in a browser.

## What the new UI must carry

- Stack: Next.js 16, React 19, Tailwind CSS 4, TanStack Query 5, TypeScript.
- Home: header with live status, grid of service status cards, "Open Hauntings" (incidents) list with severity and time, right controls rail (mode, fault injection, audit chain).
- Incident detail: five-phase progress timeline, diagnosis card (confidence + evidence), draft-PR card, event timeline.
- Theme: dark, playful/spooky, night `#0b0f14` / crypt `#10151c` / mist `#232d3a` / bone `#e6edf3` / fog `#a3adbb`, with ectoplasm green, pumpkin orange, blood red for status.
- Constraints: WCAG AA contrast, reduced motion, no flashing, colored dots instead of icons, responsive 375/768/1024-1440 px.

## Candidates with verified links

| # | Name | Links | What it is | License / cost | Effort |
| - | ---- | ----- | ---------- | -------------- | ------ |
| 1 | **Astryx** (Meta) | [Home](https://astryx.atmeta.com/) · [Templates](https://astryx.atmeta.com/templates) · [GitHub](https://github.com/meta/astryx) · [Themes](https://astryx.atmeta.com/docs/theme) | Design system with 150+ accessible components, ready-made page templates, CLI, and 7 themes including **Gothic** (dark, atmospheric) | MIT, free, full source | Medium |
| 2 | **Pulse** (v0 by Vercel) | [Template](https://v0.app/templates/3hZwaLtyRbc) | Dark "Engineering Metrics & Incident Response Console": system status, active incidents, deployments, metrics | Free; source by forking in v0 and exporting code (free login); no public git repo | Medium |
| 3 | **Studio Admin** | [Vercel template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) · [GitHub](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) · [Demo](https://studio-admin.arhamkhnz.com/) | Next.js 16 + Tailwind 4 + shadcn admin, 25+ screens including "Infrastructure Dashboard" and "Patient Monitoring"; theme presets | MIT, free, full source | Low–medium |
| 4 | **shadcn/ui blocks** | [Blocks](https://ui.shadcn.com/blocks) · [Dark mode](https://ui.shadcn.com/docs/dark-mode) | Copy-paste dashboard block and primitives; not a full template | MIT, free | Low (but assemble the domain UI yourself) |
| 5 | **Kiranism dashboard starter** | [GitHub](https://github.com/Kiranism/next-shadcn-dashboard-starter) · [Demo](https://shadcn-dashboard.kiranism.dev) | Next.js 16 / React 19 / Tailwind 4 starter with real TanStack Query SSR and 6 themes | MIT, free | Low–medium |
| 6 | **OpenStatus** | [GitHub](https://github.com/openstatusHQ/openstatus) · [Status demo](https://status.openstatus.dev) · [Site](https://openstatus.dev) | Status page and incident response: severity, commander, open → mitigated → resolved, timeline, audit log | AGPL-3.0, free with network-use copyleft | High |
| 7 | **Checkmate** | [GitHub](https://github.com/bluewave-labs/checkmate) · [Site](https://checkmate.so) | Self-hosted monitor: status cards, uptime bars, incident timelines, 5 status-page themes | AGPL-3.0 | High |
| 8 | **Kumo** (Cloudflare) | [Docs](https://kumo-ui.com/) · [GitHub](https://github.com/cloudflare/kumo) | Accessible React component library on Base UI; dark roles; no page templates, only Page Header / Resource List blocks | MIT, free | Medium–high |
| 9 | **Tremor** | [Site](https://tremor.so/) | 35+ open dashboard/chart components on Tailwind + Radix + Recharts | Free OSS (Blocks paid); joining Vercel | Low–medium |
| 10 | **Homarr** | [GitHub](https://github.com/homarr-labs/homarr) · [Demo](https://demo.homarr.dev) (`demo` / `demo`) | Service-card grid dashboard with 80+ integrations; Mantine, not Tailwind | Apache-2.0 | High |
| 11 | **Tailwind Plus** | [Site](https://tailwindcss.com/plus) | Paid dashboard templates from the Tailwind team | ~$299 personal / ~$979 team, one-time | Medium |
| 12 | **HeroUI Pro** | [Site](https://www.heroui.com/) · [Pro](https://heroui.pro) | Tailwind components; Pro has Dashboard, Kanban, data grid, KPI cards | Free core / paid Pro | Medium |
| 13 | **Preline** | [Admin dashboard](https://preline.co/templates/dashboards/admin-dashboard/details.html) | 31-page HTML admin template with dark mode | Free tier / all-access from $249 | Medium (HTML → React port) |
| 14 | **Aceternity UI** / **Magic UI** | [Aceternity](https://ui.aceternity.com/) · [Magic](https://magicui.design/) | Animated copy-paste components; no dashboard template; heavy motion | Free tiers / Pro | Medium–high |
| 15 | Mantine / Chakra / Park UI / Radix Themes | [Mantine](https://mantine.dev/) · [Chakra](https://chakra-ui.com/) · [Park](https://park-ui.com/) · [Radix dashboard](https://www.radix-ui.com/themes/example-dashboard) | Component libraries with dark mode, but each replaces Tailwind with its own CSS system | Mostly MIT, some Pro | High |

Other dark v0 dashboards to browse if needed: [SalesOps](https://v0.app/templates/9q2Mfgu6cDi), [Financial Analytics](https://v0.app/templates/jrYuNlqLsd9), [Finova](https://v0.app/templates/GdyQpU6LNZj), [Futuristic Premium](https://v0.app/templates/futuristic-premium-dashboard-gdCD6aoyD8v). All are generic analytics/finance layouts, free, and fork-only source.

## Visual review notes

- **Astryx**: the live templates catalog is dark, dense and modern. Crucially it lists an **Incident Console** (severity-coded rows grouped by status, segmented status control, resizable detail pane), a **Service Monitoring Dashboard** (status-colored tiles with sparklines and an independently scrolling alert column), a **Project Status Dashboard** (timeline bars + at-risk list), and **Work Item Detail / Order Detail** (chronological activity timeline in a rail). These map almost one-to-one to the Graveyard home and incident detail pages.
- **Pulse (v0)**: the page loads and the description matches the domain exactly, but the embedded preview stayed blank in this browser. Open "Open in v0" to inspect the actual layout before choosing it.
- **Studio Admin**: the landing page is light-first (a dark toggle exists). Its dashboard screenshot is a clean generic admin with sidebar, charts and preferences panel — good shell, no incident semantics.
- **Kumo**: dark, clean component gallery; the look is corporate Cloudflare, not spooky, and there are no ready-made incident or service pages.
- "Kumo AI" (kumo.ai) is an unrelated company; Cloudflare's Kumo is only a component library.

## Fit against the specific dashboard

| Candidate | Dark theme | Service grid | Incident list | Phase timeline | Spooky fit | Stack fit |
| --------- | ---------- | ------------ | ------------- | -------------- | ---------- | --------- |
| Astryx | Yes, Gothic theme | Service Monitoring Dashboard | Incident Console | Work Item / Order Detail rail | Best out of the box | React 19 yes; adds StyleX beside Tailwind |
| Pulse (v0) | Yes | Yes | Yes | No | Needs full restyle | Next/shadcn yes; source via export |
| Studio Admin | Yes (toggle) | Infrastructure screen | No | No | Needs full restyle | Exact (Next 16 + Tailwind 4) |
| shadcn blocks | Yes | Build it | Build it | Build it | Full control via CSS vars | Exact |
| OpenStatus | Light-leaning | Yes | Yes | Yes | Needs restyle | Patterns only; AGPL code risk |
| Kumo | Yes | Build it | Build it | Build it | Poor | Adds own styling + icon dependency |

## Trade-offs to accept

- **Astryx** is the closest domain match and the only option with a ready dark "Gothic" theme, but it adds StyleX alongside Tailwind and its components ship icons; the repo's no-icons/colored-dot rule would need deliberate restraint. Charts are canary-only.
- **shadcn/ui / Studio Admin / Kiranism** stay inside the current stack and need zero new styling system, but every SRE-specific surface (incident list, five-phase timeline, haunt panel) must be built from primitives.
- **v0 templates** give the most polished dark incident layout instantly, but you cannot clone a git repo: you fork in v0 and export, and the audit trail of generated code lives outside this repo.
- **OpenStatus / Checkmate** are AGPL. Use them as pattern references only; do not copy their code into an MIT project without legal review.
- Avoid Aceternity/Magic UI heavy animation: `DESIGN.md` forbids flashing and requires reduced-motion support.

## Recommendation — pick one

1. **Best overall fit: Astryx.** Use the `gothic` theme and start from the *Incident Console* + *Service Monitoring Dashboard* templates, then use *Work Item Detail* for the incident detail rail. It removes the most design work and is MIT, free, React 19 compatible, and explicitly supports Tailwind overrides. Cost: one extra CSS system (StyleX) and trimming icons.
2. **Lowest-risk alternative: Studio Admin or shadcn/ui blocks.** Keeps Next.js 16 + Tailwind 4 + shadcn exactly as-is, with no new dependency class. Choose this if repo standards favour boring, minimal changes over visual polish.
3. **Fastest visual mock-up: Pulse (v0).** Good for a pitch or a screenshot, weaker as a long-term codebase because source is export-only.
4. **Reference only: OpenStatus.** Borrow the incident state model and timeline layout ideas, not the code.

Reply with the number/name you want and the rewrite can start from that base.
