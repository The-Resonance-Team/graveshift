# Fixer (Exorcist, GitHub) — Requirements

## R1 GitHub App auth
- R1.1 WHEN the fixer calls GitHub THE SYSTEM SHALL authenticate as a GitHub App installed only on selected repositories.

## R2 Patch guard
- R2.1 WHEN a patch touches `forbiddenPaths` or exceeds file/line size limits THE SYSTEM SHALL reject it before any push (SEC-6).

## R3 Branch and PR
- R3.1 WHEN creating a fix THE SYSTEM SHALL push to `refs/heads/graveshift/inc-<shortid>-<slug>`.
- R3.2 WHEN opening a PR THE SYSTEM SHALL set `draft: true` and apply labels `graveshift`, `exorcism`.
- R3.3 The fixer SHALL never call the merge API.

## R4 PR body
- R4.1 WHEN opening a PR THE SYSTEM SHALL render the §10.3 template with redacted evidence and a dashboard link.

## R5 CI and merge detection
- R5.1 WHEN a PR is open THE SYSTEM SHALL poll check-runs every 30 s and detect external merge without merging itself.
