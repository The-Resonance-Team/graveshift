# Glossary

This file holds system-wide domain terms only. Each area's terms live in the `GLOSSARY.md` named in `GLOSSARY-MAP.md`. Design tokens, copy tables and implementation rules live in `DESIGN.md`.

## The crew

- **Ghost** — an AI agent in the Graveshift crew.

## State and events

- **Project** — a scope a user creates in the console after registering an account. One numeric `projectId` names it on the Event envelope, the event subject, every stored row, every Credential and every audit entry. The same value is the Sentry project id: our system and Sentry share one project identity.
- **Grave** — a service under watch.
- **Graveyard** — the dashboard that shows all graves.
- **Resting in peace** — the healthy state of a grave.
- **Haunting** — an incident: a period when a grave is not healthy.
- **Restless spirit** — a crash loop.
- **Drained by a leech** — an out-of-memory termination.

## Configuration and integration

- **AI Harness** — the chat surface where agents talk to each other to resolve a task from the user or the system.
