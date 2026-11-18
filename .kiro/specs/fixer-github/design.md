# Fixer — Design

## Interfaces
- `generatePatch(diagnosis): Patch` — diff plus file list.
- `guardPatch(patch): void` — throws on forbidden paths or oversized files.
- `openDraftPr(patch, incident): PrRef` — Git Data API flow: blob → tree → commit → ref → PR.

## Data flow
Diagnosis → patch generation → guard → branch + commit → draft PR (template, labels) → poll check-runs → merge detection.

## Error handling
- Guard rejection aborts before any push. App auth failure surfaces a typed error; no token is logged.

## Testing
- Patch-guard property tests (§14.2 #5); PR body renderer snapshot; fake GitHub API in integration tests.
