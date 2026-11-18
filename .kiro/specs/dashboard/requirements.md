# Dashboard — Requirements

## R1 Core views
- R1.1 WHEN the dashboard loads THE SYSTEM SHALL show a graveyard grid of services and their health state.
- R1.2 WHEN an incident is selected THE SYSTEM SHALL show its timeline (Wraith → Medium → Exorcist → resolved → autopsy) and PR links.

## R2 Audit
- R2.1 WHEN audit events are shown THE SYSTEM SHALL display a chain-verification badge (SEC-10).

## R3 Haunt and mode
- R3.1 WHEN an approver uses the Haunt panel THE SYSTEM SHALL inject a fault into the demo app only, rate-limited (SEC-12).
- R3.2 WHEN the mode view is shown THE SYSTEM SHALL display the effective policy mode and any ignored override.

## R4 Live updates
- R4.1 WHEN state changes THE SYSTEM SHALL push updates over SSE with latency under 1 s.

## R5 First run and accessibility
- R5.1 WHEN no config exists THE SYSTEM SHALL show a first-run wizard.
- R5.2 The UI SHALL follow `.kiro/steering/halloween-voice.md`: themed labels with plain-English tooltips, contrast at least 4.5:1, reduced-motion support and no flashing.
