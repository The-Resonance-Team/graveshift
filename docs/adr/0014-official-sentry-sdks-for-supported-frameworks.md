# Official Sentry SDKs with a custom DSN own Plugin telemetry

Status: accepted

On 2026-11-21 the owner set one rule for host integrations. Any framework with an official Sentry SDK uses that SDK unchanged. We do not build a Graveshift SDK or a custom Plugin for such a framework. The host replaces the Sentry DSN host with our API: `https://<credential>@<api-host>/<project-id>`. The SDK posts standard Sentry envelopes to `POST /api/:grave/envelope/`; ticket #71 owns the adapter that maps them to `EventEnvelope`. The SDK never holds NATS credentials. This covers web, backend, mobile, game, native and serverless SDKs; one ingest path serves them all.

The DSN public key is a #63 Credential with `events:publish` scope. Sentry DSN keys allow only letters, digits and underscore, while #63 issues base64url values that may contain a hyphen. Credential values are therefore issued in lowercase hex, so the DSN public key is the Credential value verbatim. #71 refactors issuance; #79 stores the same format in PostgreSQL. The numeric project id in the DSN path exists only for SDK compatibility. It is stored on the Credential as `projectId`; the adapter checks that the SDK path segment matches it and resolves the Grave from the Credential's `service` binding. The adapter also accepts the SDK's default `sentry_key` query parameter as well as the header forms.

In v2 we collect every event the SDK sends and map `event` items to valid `EventEnvelope` records. Other item types are skipped. We do not impose the old hand-written Plugin's per-request or severity rules; shaping Sentry events into richer domain telemetry moves to a v3 ticket in map #18. Ticket #50 is documentation only: it points to official Sentry setup guides, explains DSN replacement and the hex key, shows a local tunnel for development, and lists the supported platforms. A cloud subscription will provide a stable API host in v3; local development uses a tunnel such as ngrok.

The hand-written `packages/plugin-nestjs` is superseded and removed by #71, which already edits `ARCHITECTURE.md`. A Collector stays a different shape under ADR 0005: a daemon-side adapter that reads infrastructure or cloud state. When no official SDK or protocol client exists, a Collector may expose or call a custom consumer API. It still publishes one `EventEnvelope` through the owning `Publisher` and never evaluates rules.

Trade-off: reusing Sentry SDKs gives framework instrumentation for free and keeps our code to one ingest adapter and one guide. We accept the Sentry event shape in v2 and defer domain-specific shaping to v3.
