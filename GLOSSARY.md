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

- **Release** — a versioned build of a Grave that a Deploy can place in an Environment.
- **Environment** — a target where a Release runs, such as staging or production.
- **Deploy** — the act of placing a Release in an Environment.

## Product and license

- **Cloud** — Graveshift hosted by us on our infrastructure and sold by subscription.
- **Subscription** — an agreement for the use of Cloud. Commercial use needs a yearly Subscription.
- **Personal use** — use of Graveshift for one's own work. It is free.
- **Commercial use** — use of Graveshift for business or paid work. It needs a yearly Subscription.

## Configuration and integration

- **AI Harness** — the chat surface where agents talk to each other to resolve a task from the user or the system.

## Avoid

- _Avoid_ **User** — say Account.
- _Avoid_ **Client** for a person — say Account.
- _Avoid_ **Tenant** — say Organization.
- _Avoid_ **Deployment event** — say Deploy.
- _Avoid_ **Subscription** for the event subscription term. That term lives in `apps/api/GLOSSARY.md`.
