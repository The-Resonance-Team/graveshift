# Discord (Banshee) — Requirements

## R1 Commands, buttons, threads
- R1.1 WHEN a user invokes `/graveshift status|incidents|incident|haunt|silence|mode|autopsy` THE SYSTEM SHALL respond per §10.4 with approver checks on privileged commands.
- R1.2 WHEN an incident is opened THE SYSTEM SHALL create one dedicated thread for its timeline and post the incident embed with Bless/Banish/Salt-line buttons.
- R1.3 Button `custom_id` SHALL follow `gs:{verb}:{actionId}:{nonce}` and stay under 100 characters.

## R2 Approver check
- R2.1 WHEN a non-approver presses Bless or Banish THE SYSTEM SHALL reject the interaction.

## R3 Defer
- R3.1 WHEN an interaction arrives THE SYSTEM SHALL call `deferUpdate()` immediately to answer within ~3 s.

## R4 Approval token
- R4.1 WHEN an approval token is used THE SYSTEM SHALL verify and consume it: single-use, 15 min TTL, replay rejected (SEC-7).
- R4.2 WHEN a token is blessed THE SYSTEM SHALL pass the action through PolicyEngine to the actuator.

## R5 Webhook fallback
- R5.1 WHEN no bot token is configured THE SYSTEM SHALL post via webhook without buttons and accept approval in the dashboard.
