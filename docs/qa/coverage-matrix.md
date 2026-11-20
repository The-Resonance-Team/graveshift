# Graveyard dashboard QA, 2026-11-20

Run against the real Compose stack (daemon, demo app, Postgres, Prometheus, actuator) with `next start -p 3300`, using headless Chrome driven by puppeteer-core from /tmp/qa/qa.ts. Screenshots are in /tmp/qa/shots.

route | control | before → after | URL | evidence | width
--- | --- | --- | --- | --- | ---
/ | graveyard grid | loading | http://localhost:2604/ | "Loading watched services…", loading.png | 1280
/ | first-run wizard | daemon down → wizard "Start the crew" + alert "Could not reach the Graveshift daemon (GET /api/graveyard → network)" | http://localhost:2604/ | wizard-error.png, /api/* aborted on purpose | 1280
/ | wizard Next ×2 + Done | step 1 → "Learn the words" → hidden; still hidden after reload | http://localhost:2604/ | DOM | 1280
/ | graveyard grid | graves api, postgres, worker | http://localhost:2604/ | home-1280.png, GET /api/graveyard 200 | 1280
/ | audit chain badge | "Chain verified: 5 entries" | http://localhost:2604/ | GET /api/audit/verify 200 | 1280
/ | mode view | "propose / Propose: draft pull requests are allowed, runtime actions need a blessing" | http://localhost:2604/ | GET /api/mode 200 | 1280
/ | live status | "Live" | http://localhost:2604/ | GET /api/events 200 (EventSource) | 1280
/ | Term tooltip (Tab focus) | hidden → display block, "Dashboard that shows every watched service" | http://localhost:2604/ | computed style | 1280
/ | Haunt null-candy | idle → "Injected null-candy. Watch the graveyard.", button "Wait 30 s" | http://localhost:2604/ | POST /api/haunt 202 | 1280
/ | SSE incident update | no incident → incident listed; DOM 3 to 23 ms after the daemon emitted the event | http://localhost:2604/ | MutationObserver vs raw SSE arrival time | 1280
/ | grave card (haunted) | "Resting in peace" → "Haunting, incident is diagnosed", orange border | http://localhost:2604/ | haunted-1280.png | 1280
/ | Haunt again within 30 s (fresh tab) | idle → "Rate limited by the daemon.", button "Wait 26 s" | http://localhost:2604/ | POST /api/haunt 429 (expected) | 1280
/incidents/[id] | open from grave card | / → timeline; phases Wraith, Medium, Exorcist done; Resolved, Autopsy pending | http://localhost:2604/incidents/<uuid> | incident-1280.png, GET /api/incidents/<id> 200 | 1280
/incidents/[id] | Exorcism section | "No draft pull request yet." (no patch generator yet) | http://localhost:2604/incidents/<uuid> | DOM | 1280
/incidents/[id] | Back to the graveyard | incident → home | http://localhost:2604/ | DOM | 1280
/incidents/[id] | unknown id | error "This incident could not be loaded (GET /api/incidents/nope → 404)" | http://localhost:2604/incidents/nope | GET 404 (expected) | 1280
/ | layout | 2 grid columns, no horizontal overflow, controls stacked below | http://localhost:2604/ | home-768.png | 768
/incidents/[id] | layout | 5 phase columns, no horizontal overflow | http://localhost:2604/incidents/<uuid> | incident-768.png | 768
/ | layout | 1 grid column, no horizontal overflow, controls stacked below | http://localhost:2604/ | home-375.png | 375
/incidents/[id] | layout | 2 phase columns, no horizontal overflow | http://localhost:2604/incidents/<uuid> | incident-375.png | 375
/ | prefers-reduced-motion | tooltip transition 1e-05s; no keyframes defined | http://localhost:2604/ | computed style | 1280

Console: 0 unexpected errors. 27 expected errors belong to the forced-failure rows (aborted /api/* requests, the 429 and the 404).
API statuses seen: GET /api/events 200, /api/graveyard 200, /api/incidents 200, /api/incidents/<id> 200, /api/mode 200, /api/audit 200, /api/audit/verify 200, POST /api/haunt 202 and 429, GET /api/incidents/nope 404.

Found and fixed during the pass:
- Blood text on the original card surface (#141b24) measured 4.43:1. Crypt is now #10151c (Blood 4.68:1), and status-coloured hover surfaces use Night.
- Hidden tooltips widened the page at 375 px; they now use display none until hover or focus, capped at min(16rem, 80vw).
- A missing favicon logged a 404; added src/app/icon.svg.
