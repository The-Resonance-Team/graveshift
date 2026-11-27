# Deployment is the triage root

Status: accepted

On 2026-11-23 the owner decided that Deployment is the one concept for a code version that a Project places in an Environment. Deployment, formerly called Deploy, is the root for triaging Events, data, Incidents and the agent's resolution point.

The Release term and the Release table are removed. No Release model, column or table remains. Where v2 spoke of a Release, Graveshift now speaks of a Deployment.

One Deployment belongs to one Project. A Project has many Deployments. Environment is now a name string on a Deployment, such as production or sandbox; it is not an Organization-scoped table. There is no Environment model or route. Tenant identity comes from the Project.

The decision follows the Sentry research and the review of PR #125. Sentry uses Release and Environment tags on Events and carries no deploy id on an Event. Graveshift deliberately differs. Deployment and Fix audit payloads carry `deploymentId`; the AuditEntry model has no such column. `projectId` stays on every row and audit entry for access control and audit.

Only events ingested with a bound Deployment carry `deploymentId`. Collector events and Sentry events arrive with no SHA, so they stay unassigned and their Hauntings have no fix point. This is accepted for this version.

Closure keeps the opening pair. The first Event with a bound Deployment records its SHA and Environment on the Haunting. A later Event closes that Deployment only when its own SHA and Environment both equal the opening pair. An Event from another Environment with the same SHA never closes the opening Deployment.

Vercel confirms one Deployment belongs to one Project and one commit creates one Deployment per connected Project.

Trade-off: Graveshift differs from Sentry on the Event shape; Events carry a `deploymentId` that Sentry Events do not have. In return, triage groups by code version without extra tags.
