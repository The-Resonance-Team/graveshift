# Cloud and serverless Collector shapes (ticket #58)

Date: 2026-11-22. Status: research done. Part of epic #18.

## Goal

Define the shape of GCP, Azure, AWS and serverless Collectors. List read-only
sources and the auth each source needs. Give one Event envelope mapping per
source. Rank the sources by value and cost. Mark what belongs in v2 and what
waits for v3.

Base branch: the stack head resolved at start, `feat/platform-v2` at `0580ffc`.
No branch name is hard-coded in the report contract.

## Facts checked against primary sources

- ADR 0005: all watcher input goes through NATS JetStream in one normalised
  envelope. A Collector is a daemon-side adapter. Docker and Kubernetes are one
  Collector among many, not the whole input.
- `packages/integrations/src/index.ts`: `Integration` has `name`, `kind` of
  `plugin` or `collector`, `start()` and `stop()`. `EventDetails` carries
  `source`, `type`, `severity`, `traceId`, `fingerprint` and optional `payload`.
- `packages/core/src/schemas.ts`: `EventEnvelopeSchema` requires `id`,
  `tenantId`, `source`, `service`, `type`, `severity` (`info`, `warning`,
  `critical`), `observedAt`, `traceId`, `fingerprint`, `payload`. `type` is a
  string of dot-separated tokens. `fingerprint` is a non-empty string.
- `docs/ARCHITECTURE.md` section "Plugins and Collectors": cloud Collectors are
  out of scope for the current build. A Collector never evaluates a rule.
- Epic #18, section "v3 — planned and not yet specified": "Cloud and serverless
  Collectors, shaped by ticket #58." ADR 0003: "No cloud in v2."
- Google Cloud: `roles/monitoring.viewer` is read-only for Cloud Monitoring;
  `roles/logging.viewer` reads the `_Required` and `_Default` buckets;
  `roles/logging.privateLogViewer` adds Data Access audit logs.
  (`docs.cloud.google.com/monitoring/access-control`,
  `docs.cloud.google.com/logging/docs/access-control`)
- Azure: Resource Graph needs `Microsoft.ResourceGraph/resources` read rights;
  Reader alone can return 403. Microsoft Graph sign-in and audit logs need
  `AuditLog.Read.All` and `Directory.Read.All` with admin consent. Sign-in
  reports need an Entra ID P1 or P2 licence.
  (`learn.microsoft.com/azure/governance/resource-graph/overview`,
  `learn.microsoft.com/entra/identity/monitoring-health/howto-analyze-activity-logs-with-microsoft-graph`)
- AWS: `CloudWatchReadOnlyAccess`, `CloudWatchLogsReadOnlyAccess` and
  `AWSConfigUserAccess` are read-only managed policies. IRSA and OIDC federation
  give short-lived credentials with no long-lived access key. AWS Health and
  Trusted Advisor need a Business or Enterprise support plan.
  (`docs.aws.amazon.com/aws-managed-policy/latest/reference/`,
  `docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html`,
  `docs.aws.amazon.com/health/latest/ug/security_iam_id-based-policy-examples.html`)

## Contract every mapping follows

Each source is one `kind: 'collector'` `Integration`. The host supplies the
`Publisher`, `tenantId` and `service`. `service` names the Grave under watch.
The Collector builds one envelope with `envelopeBuilder()`. It uses the injected
clock for `id`, `observedAt` and `traceId`. It sends every envelope to the
`Publisher`. It never evaluates a rule and it never holds NATS credentials.

Severity follows the two lanes of ADR 0005. `info` feeds telemetry, baselines
and charts. `warning` and `critical` drive detection by the Wraith. The
Collector does not decide a rule action; it reports a state and a severity.

Redaction is allow-list based. The payload carries only the fields named in the
mapping. Any other field, raw message, credential, token, connection string and
request body is dropped before publish. Strings that stay in the payload pass
through the repo redactor. Fingerprints use normalised, stable identifiers only.
They carry no clock value, no request id and no secret.

One identity model applies to all providers. Use workload identity federation or
a managed identity, never a long-lived key. Grant read-only roles at the
smallest scope that works. Store any needed secret in the credential store from
ADR 0013, never in YAML. Fail closed at `start()` when auth or scope is wrong.
Fail open on each publish so telemetry cannot break the host.

## v2 and v3 decision

All sources in this report wait for **v3**. None belongs in v2.

Reason: epic #18 puts "Cloud and serverless Collectors, shaped by ticket #58"
in v3. ADR 0003 says there is no cloud in v2. The v2 Collector work is ticket
#55 (Prometheus, Docker and Kubernetes) and the Sentry-compatible Plugin ingest
in ticket #71. Both are self-hosted or in-process paths. They are not cloud
provider Collectors.

Consequence: no implementation issue is created for this ticket. The task
pre-authorises issues only for sources inside the agreed v2 scope. There is no
cloud source inside that scope. The ranked list below is a proposal for the v3
map. The coordinator decides when v3 work opens.

## GCP

Auth model: a service account through Workload Identity Federation, with no key
file. Grant per-service read-only roles. Use a log sink to Pub/Sub for streaming
when v3 needs push; grant `roles/pubsub.viewer` only on that sink.

| Read-only source | Auth (predefined role) | `source` | `type` | Severity | Fingerprint recipe | Redacted payload fields |
| --- | --- | --- | --- | --- | --- | --- |
| Cloud Monitoring metrics, alerts, SLOs | `roles/monitoring.viewer`; narrow: `roles/monitoring.alertPolicyViewer` | `gcp-monitoring` | `metrics.threshold`, `alert.state_change`, `slo.burn` | `info` for metrics; `warning` or `critical` for alert state | `gcp-mon:<project>:<metric>:<resource>` | Labels with user data, metric values with trace ids, notification channel addresses |
| Cloud Logging (platform and app logs) | `roles/logging.viewer` | `gcp-logging` | `log.error_count`, `log.pattern` | `warning` for error bursts; `info` otherwise | `gcp-log:<project>:<log_id>:<severity>` | Raw log text, request bodies, user emails, IP addresses, auth headers |
| Cloud Audit Logs (Admin Activity, Data Access, Policy Denied) | `roles/logging.viewer` for Admin Activity; `roles/logging.privateLogViewer` for Data Access | `gcp-audit` | `audit.privileged_change`, `audit.policy_denied` | `warning` for change or denial; `critical` for credential change | `gcp-audit:<project>:<principal_hash>:<method>` | Principal email, caller IP, request payload, resource names with user ids |
| Cloud Asset Inventory | `roles/cloudasset.viewer` | `gcp-assets` | `inventory.resource_change`, `inventory.iam_change` | `warning` for IAM change; `info` for resource change | `gcp-asset:<project>:<asset_type>:<asset_hash>` | Asset labels with user data, IAM member emails, policy conditions |
| Recommender | `roles/recommender.viewer` | `gcp-recommender` | `advice.cost`, `advice.security` | `info` | `gcp-rec:<project>:<recommender_id>:<recommendation_hash>` | Resource display names, contact emails, free-text descriptions |
| Error Reporting and Cloud Trace | `roles/errorreporting.viewer`, `roles/cloudtrace.user` | `gcp-errors` | `error.group_new`, `trace.latency_spike` | `warning`; `critical` for a new high-volume group | `gcp-err:<project>:<group_hash>` | Stack frames with source paths, user ids, request parameters, trace messages |

## Azure

Auth model: a Microsoft Entra ID app registration with a federated credential or
a managed identity. No client secret. Grant Reader at subscription or resource
group scope, plus the extra data-plane rights named below. Entra activity logs
use Graph application permissions with admin consent.

| Read-only source | Auth (role or permission) | `source` | `type` | Severity | Fingerprint recipe | Redacted payload fields |
| --- | --- | --- | --- | --- | --- | --- |
| Azure Monitor metrics | Reader; `Microsoft.Insights/metrics/read` | `azure-monitor` | `metrics.threshold`, `alert.state_change` | `info` for metrics; `warning` or `critical` for alert state | `az-mon:<subscription>:<metric>:<resource>` | Metric dimensions with user data, resource tags with identities |
| Azure Activity Log | Reader; `Microsoft.Insights/activityLogs/read`. Stream with a diagnostic setting to Event Hubs | `azure-activity` | `audit.resource_change`, `audit.role_change` | `warning` for change; `critical` for role assignment | `az-act:<subscription>:<operation>:<resource_hash>` | Caller email or object id, client IP, request body, resource names with user ids |
| Azure Resource Graph | `Microsoft.ResourceGraph/resources` (Resource Graph Reader role); Reader alone can be 403 | `azure-graph` | `inventory.resource_change` | `info` | `az-graph:<subscription>:<resource_type>:<resource_hash>` | Resource tags with identities, principal names, free-text properties |
| Microsoft Entra sign-in and audit logs | Graph app permission `AuditLog.Read.All` and `Directory.Read.All`, admin consent, P1 or P2 licence | `azure-entra` | `identity.signin_failure`, `identity.audit_change` | `warning` for failure burst or change; `critical` for admin or credential change | `az-entra:<tenant>:<activity>:<actor_hash>` | User principal name, IP, device name, location, sign-in details, target object id |
| Azure Advisor | `Microsoft.Advisor/recommendations/read` | `azure-advisor` | `advice.cost`, `advice.security` | `info` | `az-adv:<subscription>:<recommendation_hash>` | Resource names, contact emails, free-text descriptions |
| Azure Service Health and Resource Health | `Microsoft.ResourceHealth/availabilityStatuses/read` | `azure-health` | `service.incident`, `resource.unavailable` | `warning`; `critical` for an active outage | `az-health:<subscription>:<region>:<service>` | Incident titles with account data, affected resource ids with user ids |

## AWS

Auth model: an IAM role assumed through OIDC federation (IRSA on EKS, EKS Pod
Identity, or a web identity for another cluster). No long-lived access key.
Attach read-only managed policies at the smallest scope that works.

| Read-only source | Auth (managed policy or action) | `source` | `type` | Severity | Fingerprint recipe | Redacted payload fields |
| --- | --- | --- | --- | --- | --- | --- |
| CloudWatch metrics and alarms | `CloudWatchReadOnlyAccess` (`cloudwatch:GetMetricData`, `DescribeAlarms`) | `aws-cloudwatch` | `metrics.threshold`, `alarm.state_change` | `info` for metrics; `warning` or `critical` for alarm state | `aws-cw:<account>:<region>:<metric>:<resource>` | Dimensions with user data, alarm names with identities, SNS topic addresses |
| CloudWatch Logs | `CloudWatchLogsReadOnlyAccess` (`logs:FilterLogEvents`, `StartQuery`) | `aws-logs` | `log.error_count`, `log.pattern` | `warning` for error bursts; `info` otherwise | `aws-log:<account>:<region>:<log_group>:<severity>` | Raw log text, request bodies, user emails, IP addresses, auth headers |
| AWS CloudTrail | `AWSCloudTrail_ReadOnlyAccess` (`cloudtrail:LookupEvents`) plus S3 read for archived trails | `aws-cloudtrail` | `audit.privileged_change`, `audit.policy_denied` | `warning` for change or denial; `critical` for credential change | `aws-trail:<account>:<region>:<principal_hash>:<event_name>` | Principal ARN, source IP, request parameters, user agent, resource ids with user ids |
| AWS Config | `AWSConfigUserAccess` (`config:DescribeComplianceByResource`) | `aws-config` | `config.noncompliant`, `config.resource_change` | `warning` for non-compliance; `info` for change | `aws-cfg:<account>:<region>:<rule>:<resource_hash>` | Resource ids with user ids, config item JSON with user data, tags with identities |
| AWS Health | Read `Describe*` actions with a custom read policy; Business or Enterprise support plan | `aws-health` | `service.incident`, `resource.unavailable` | `warning`; `critical` for an active outage | `aws-health:<account>:<region>:<event_type>` | Affected resource ids with user ids, account contact data, free-text descriptions |
| AWS Trusted Advisor | `support:DescribeTrustedAdvisorChecks` and result reads; do not call `RefreshTrustedAdvisorCheck` (a write). Needs a support plan | `aws-advisor` | `advice.cost`, `advice.security` | `info` | `aws-ta:<account>:<check_id>:<recommendation_hash>` | Resource names, contact emails, free-text descriptions |
| AWS X-Ray | `AWSXrayReadOnlyAccess` (`xray:Get*`, `xray:BatchGet*`) | `aws-xray` | `trace.latency_spike`, `trace.error_rate` | `warning` | `aws-xray:<account>:<region>:<service>:<group_hash>` | Annotations with user data, segment messages, request parameters, user ids |

## Serverless

There is no separate serverless SDK in this design. A serverless Collector reads
the same provider metrics, logs and traces as above and maps them to a function
or service. It reuses the GCP, Azure and AWS auth sections above. It publishes
envelopes on the same `Integration` contract. A per-function Plugin may still
send SDK telemetry through the v2 Sentry-compatible ingest (ticket #71, ADR
0014); that is a Plugin, not a Collector.

| Read-only source | Auth (reuse) | `source` | `type` | Severity | Fingerprint recipe | Redacted payload fields |
| --- | --- | --- | --- | --- | --- | --- |
| AWS Lambda (Duration, Errors, Throttles, ConcurrentExecutions, cold starts from logs) | `CloudWatchReadOnlyAccess` + `CloudWatchLogsReadOnlyAccess`; IRSA | `aws-lambda` | `serverless.error_rate`, `serverless.throttle`, `serverless.cold_start` | `warning` for error or throttle; `info` for cold start; `critical` for sustained errors | `aws-lambda:<account>:<region>:<function>:<signal>` | Function environment values, request ids, event payloads, log text, user data in event source ARNs |
| GCP Cloud Run and Cloud Functions (request count, latency, container instances, execution errors) | `roles/monitoring.viewer` + `roles/logging.viewer`; Workload Identity Federation | `gcp-serverless` | `serverless.error_rate`, `serverless.instance_limit`, `serverless.cold_start` | `warning` for error or instance limit; `info` for cold start | `gcp-sls:<project>:<region>:<service>:<signal>` | Request headers, bodies, user emails, IP addresses, container log text |
| Azure Functions (invocations, errors, duration, Application Insights requests and exceptions) | Reader + `Microsoft.Insights/metrics/read`; Application Insights read rights | `azure-functions` | `serverless.error_rate`, `serverless.throttle`, `serverless.cold_start` | `warning` for error or throttle; `info` for cold start | `az-sls:<subscription>:<region>:<function_app>:<signal>` | Invocation payloads, user ids, IP addresses, exception messages, App Insights custom dimensions |

## Ranking by value and cost

Rank is by value-to-cost ratio. "Cost" includes API or log-ingest charges,
licences, auth setup and data sensitivity, not only money. High value means the
source shortens detection or diagnosis of a haunting. Every row is **v3**.

| Rank | Source | Value | Cost | Phase |
| --- | --- | --- | --- | --- |
| 1 | AWS CloudWatch metrics and alarms | High | Low | v3 |
| 2 | GCP Cloud Monitoring | High | Low | v3 |
| 3 | Azure Monitor metrics | High | Low | v3 |
| 4 | AWS Lambda | High | Low (reuses CloudWatch) | v3 |
| 5 | GCP Cloud Run and Cloud Functions | High | Low (reuses Monitoring and Logging) | v3 |
| 6 | Azure Functions | High | Low-Medium (Application Insights) | v3 |
| 7 | AWS CloudTrail | High | Medium | v3 |
| 8 | GCP Cloud Audit Logs | High | Medium | v3 |
| 9 | Azure Activity Log | High | Low-Medium | v3 |
| 10 | AWS CloudWatch Logs | High | Medium (volume based) | v3 |
| 11 | GCP Cloud Logging | High | Medium (volume based) | v3 |
| 12 | Azure Resource Graph | Medium | Low | v3 |
| 13 | AWS Config | Medium | Low | v3 |
| 14 | GCP Cloud Asset Inventory | Medium | Low | v3 |
| 15 | Azure Service Health and Resource Health | Medium | Low | v3 |
| 16 | AWS Health | Medium | Medium (support plan) | v3 |
| 17 | GCP Error Reporting and Cloud Trace | Medium | Low | v3 |
| 18 | AWS X-Ray | Medium | Low | v3 |
| 19 | Microsoft Entra sign-in and audit logs | High | High (licence, consent, sensitivity) | v3 |
| 20 | GCP Recommender | Low-Medium | Low | v3 |
| 21 | Azure Advisor | Low-Medium | Low | v3 |
| 22 | AWS Trusted Advisor | Low-Medium | Medium (support plan) | v3 |

If v3 opens, start with ranks 1 to 6. They give the most detection value for the
least setup cost. Add ranks 7 to 11 for audit and log evidence. Add the rest only
with a named client and a measured need.

## Result

- Report path: `docs/reports/2026-11-22-cloud-collector-shapes.md`.
- One envelope mapping is defined for each of the 22 sources above.
- Auth is defined per source. All sources wait for v3.
- No GitHub implementation issue was created. There is no cloud source in the
  agreed v2 scope, so the pre-authorisation does not apply. The ranked list is a
  proposal for the v3 map and goes to the coordinator as a report only.
- No running code changed. No test, network call or daemon was added.
