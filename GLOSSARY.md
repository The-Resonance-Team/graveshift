# Glossary

This file holds domain terms only. Design tokens, copy tables and implementation rules live in `DESIGN.md`.

## The crew

- **Ghost** — an AI agent in the Graveshift crew.
- **Wraith** — the ghost that watches signals.
- **Medium** — the ghost that builds a diagnosis.
- **Exorcist** — the ghost that prepares a fix as a draft pull request.
- **Banshee** — the ghost that notifies people and collects approvals.

## State and events

- **Grave** — a service under watch.
- **Graveyard** — the dashboard that shows all graves.
- **Resting in peace** — the healthy state of a grave.
- **Haunting** — an incident: a period when a grave is not healthy.
- **Restless spirit** — a crash loop.
- **Drained by a leech** — an out-of-memory termination.
- **Salt line** — a silence window that suppresses signals for one service.

## Actions and outcomes

- **Diagnosis** — the stated root cause of a haunting, with supporting evidence and confidence.
- **Exorcism** — a draft pull request that fixes the cause of a haunting.
- **Blessing** — a human approval of a proposed runtime action.
- **Banishment** — a human rejection of a proposed runtime action.
- **Autopsy** — the postmortem written when a haunting closes.
- **Audit chain** — the ordered, tamper-evident record of decisions.

## Configuration and integration

- **Agent** — a configured worker with a role, a prompt and a model. The crew calls an agent a Ghost. _Avoid_: Bot.
- **Routing agent** — the built-in agent that selects a target agent by trigger keywords and fills prompt params from a request.
- **AI Harness** — the chat surface where agents talk to each other to resolve a task from the user or the system.
- **Plugin** — an in-process integration shipped into a client framework.
- **Collector** — a daemon-side integration that reads infrastructure or cloud state.
- **Event envelope** — the normalised message that every source publishes to the queue.
- **Rule override** — a client rule that replaces a system rule with the same id.

## Work items and fixes

- **Work item** — the record created when an incident is defined and verified. It carries triage, fix state and subtasks.
- **Fix now** — the user action that moves a work item to the front of the fix queue, or triggers a fix when auto-fix is disabled.
