# Official Sentry SDKs with a custom DSN own Plugin telemetry

Status: accepted

On 2026-11-21 the owner set one rule for host integrations. When an official Sentry SDK supports the host framework, a Graveshift Plugin is a thin wrapper around that SDK with a DSN that points at our API (`https://<credential>@<api-host>/<grave>`). We do not hand-build Event envelopes or write instrumentation for a framework that an official SDK already covers. The DSN public key is a #63 Credential with `events:publish` scope; ticket #71 maps Sentry envelopes to `EventEnvelope` on the server. The SDK never holds NATS credentials.

We write a custom Plugin only for a framework that no official Sentry SDK package supports. Such a Plugin uses `packages/integrations` and the injected `Publisher` from ADR 0005, and still emits one normalised envelope with `tenantId`. It uses the shared envelope builder and our redactor; it never invents a second envelope format. Before adding a custom Plugin, check the official Sentry SDK list with Context7 and record the absence in the ticket.

This rule supersedes the hand-written NestJS Plugin in `packages/plugin-nestjs`. An official `@sentry/nestjs` SDK exists, so that package is removed and NestJS host support moves to the SDK wrapper. Ticket #50 owns the SDK wrappers for NestJS, Express and Fastify and the removal of `packages/plugin-nestjs`; `docs/ARCHITECTURE.md` is updated with the new path. The behavior of the old Plugin stays the contract: one info event per request, one critical event per handler error, fail-open capture, shared `traceId`, stable fingerprint and redaction before send.

A Collector is a different shape under ADR 0005: it is a daemon-side adapter that reads infrastructure or cloud state. When no official SDK or protocol client exists, a Collector may expose or call a custom consumer API. It still publishes one `EventEnvelope` through the owning `Publisher` and never evaluates rules.

Trade-off: Sentry SDKs give us framework instrumentation and redaction hooks for free, but they tie each Plugin to Sentry wire behavior and to our #71 adapter. A custom Plugin is kept only where no SDK exists, so we do not maintain two telemetry paths for one framework.
