# Dashboard — Design

## Interfaces
- Server-sent events endpoint from `apps/daemon` → client store.
- Views: GraveyardGrid, IncidentTimeline, AuditPanel (chain badge), HauntPanel, ModeView, FirstRunWizard.

## Data flow
Daemon event bus → SSE → client store → themed components with plain-English tooltips.

## Error handling
- SSE disconnect → reconnect with backoff and refetch state. Haunt abuse → rate-limit response (SEC-12).

## Testing
- Component tests for grid/timeline; a11y checks (contrast, motion, tooltips); SSE latency check.
