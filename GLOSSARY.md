# Glossary

This file holds system-wide domain terms only. Each area's terms live in the `GLOSSARY.md` named in `GLOSSARY-MAP.md`. Design tokens, copy tables and implementation rules live in `DESIGN.md`.

## The crew

- **Ghost** — an AI agent in the Graveshift crew.

## Identity and access

- **Account** — a person's registered identity in Graveshift.
- **Organization** — the group that owns Projects and Memberships. It is the root of identity.
- **Membership** — an Account's bond to one Organization, with one Role.
- **Role** — the part an Account plays in a Membership: owner or member.
- **Scope** — a named permission for one kind of action.

## State and events

- **Project** — a scope a user creates in the console after registering an account. One numeric `projectId` names it on the Event envelope, the event subject, every stored row, every Credential and every audit entry. The same value is the Sentry project id: our system and Sentry share one project identity. Graveshift assigns the numeric id when the Project is created. The user sets a slug as its label. The slug is not a second id and is not a mapping to Sentry.
- **Grave** — a service under watch.
- **Graveyard** — the dashboard that shows all graves.
- **Resting in peace** — the healthy state of a grave.
- **Haunting** — an incident: a period when a grave is not healthy.
- **Restless spirit** — a crash loop.
- **Drained by a leech** — an out-of-memory termination.

## Delivery

- **Deployment** — one commit SHA deployed by one Project into one Environment. It is the root for triage of Events, data, Incidents and the agent's resolution point. Deployment is the user-facing noun. Code identifiers keep the legacy name Deploy, as in the Deploy model, DeployRepo and the deploys table.
- **Environment** — a name on a Deployment, such as production or sandbox; it is not a separate table.
- **Deploy** — to place code in an Environment.
- **title** — the commit or tag title read from git at the deployed SHA.

## Product and license

- **Cloud** — Graveshift hosted by us on our infrastructure and sold by subscription.
- **Subscription** — an agreement for the use of Cloud. Commercial use needs a yearly Subscription.
- **Personal use** — use of Graveshift for one's own work. It is free.
- **Commercial use** — use of Graveshift for business or paid work. It needs a yearly Subscription.

## Configuration and integration

- **Agent Workspace** — the chat surface where an Account works with Agents on a task.
- **Agent Runtime** — the system that coordinates Agents and their tools to carry out a task.
- **Conversation** — one thread of messages and activity in the Agent Workspace, scoped to an Account and a Project.

## Avoid

- _Avoid_ **User** — say Account.
- _Avoid_ **Client** for a person — say Account.
- _Avoid_ **Release** — say Deployment.
- _Avoid_ **Deploy** as a noun in user-facing copy — say Deployment. Code identifiers keep Deploy.
- _Avoid_ **AI Harness** when the distinction matters — say Agent Workspace for the chat surface or Agent Runtime for the system that coordinates Agents and tools.
- _Avoid_ **Subscription** for the event subscription term. That term lives in `apps/api/GLOSSARY.md`.
