# Deployment is the triage root

Status: accepted

On 2026-11-23 the owner decided that Deployment is the one concept for a code version that a Project places in an Environment. Deployment, formerly called Deploy, is the root for triaging Events, data, Incidents and the agent's resolution point.

The Release term and the Release table are removed. No Release model, column or table remains. Where v2 spoke of a Release, Graveshift now speaks of a Deployment.

One Deployment belongs to one Project. A Project has many Deployments. Environment is now a name string on a Deployment, such as production or sandbox; it is not an Organization-scoped table. There is no Environment model or route. Tenant identity comes from the Project.

The decision follows the Sentry research and the review of PR #125. Sentry uses Release and Environment tags on Events and carries no deploy id on an Event. Graveshift deliberately differs. Every Event, Haunting, AuditEntry and fix or agent context carries `deploymentId`. `projectId` stays on all of them for access control and audit.

Vercel confirms one Deployment belongs to one Project and one commit creates one Deployment per connected Project.

Trade-off: Graveshift differs from Sentry on the Event shape; Events carry a `deploymentId` that Sentry Events do not have. In return, triage groups by code version without extra tags.
