# Sentry SDK guide

This guide shows a host team how to send telemetry to Graveshift with an official Sentry SDK. ADR 0014 owns this decision. This page is documentation only. It adds no package, no wrapper and no SDK code.

## One SDK per host

Use the official Sentry SDK for the host framework or language. One SDK per host is enough. No Graveshift SDK is needed. The host does not hold a NATS credential.

## Supported platform families

Sentry provides official SDKs for many platforms. Use the official setup guide for your host platform. Each link below opens an official Sentry setup guide. This page does not copy setup steps. Use the linked guide for the steps.

| Family | Official Sentry setup guides |
| --- | --- |
| Web and JavaScript | [JavaScript](https://docs.sentry.io/platforms/javascript/) (the page links to the React, Angular, Vue, Next.js, Node.js and Electron guides) |
| Backend languages | [Python](https://docs.sentry.io/platforms/python/), [Java](https://docs.sentry.io/platforms/java/), [Go](https://docs.sentry.io/platforms/go/), [PHP](https://docs.sentry.io/platforms/php/), [Ruby](https://docs.sentry.io/platforms/ruby/), [Rust](https://docs.sentry.io/platforms/rust/), [.NET](https://docs.sentry.io/platforms/dotnet/) |
| Mobile | [Apple (iOS and macOS)](https://docs.sentry.io/platforms/apple/), [Android](https://docs.sentry.io/platforms/android/), [React Native](https://docs.sentry.io/platforms/react-native/), [Flutter](https://docs.sentry.io/platforms/dart/guides/flutter/) |
| Game engines | [Unity](https://docs.sentry.io/platforms/unity/), [Unreal Engine](https://docs.sentry.io/platforms/unreal/), [Godot](https://docs.sentry.io/platforms/godot/) |
| Native | [Native (C and C++)](https://docs.sentry.io/platforms/native/) (this family also holds the console SDKs) |
| Serverless | [AWS Lambda (JavaScript)](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/), [Google Cloud Functions (JavaScript)](https://docs.sentry.io/platforms/javascript/guides/gcp-functions/) |

Use the [full Sentry platform list](https://docs.sentry.io/platforms/) to find a guide for a platform that is not named here.

## DSN replacement

A Sentry DSN has this structure:

`https://<credential>@<api-host>/<project-id>`

To send telemetry to Graveshift, the host takes its Sentry DSN and replaces the host with the Graveshift API host. Keep the official DSN structure.

- `<credential>` is the text before `@`. It is the Credential value that `POST /api/credentials` issues. The value is 64 lowercase hex characters. Use it as it is in the DSN.
- `<api-host>` is the Graveshift API host. See "Local development" below for the local case.
- `<project-id>` is the number after the last `/`. It must be 1 to 20 digits. It must equal the `projectId` of the Credential. If it is not numeric or not equal, the API refuses the request.

## One projectId

ADR 0018 defines one scope field, `projectId`. The Sentry DSN project id is this same `projectId`. It is not a second field. The Event envelope, the NATS subject, the stored rows, the Credentials and the audit entries all use it.

The Credential takes its `projectId` from the OAuth client that issues it. `POST /api/credentials` cannot set `projectId`. To get a Credential for a Sentry SDK, follow these steps:

1. Use an OAuth client that has a numeric `projectId` (1 to 20 digits). Set it in `GRAVESHIFT_OAUTH_CLIENTS`.
2. Get a token for that client from `POST /api/oauth/token`.
3. Call `POST /api/credentials` with kind `plugin`, the `events:publish` scope and a `service` binding.

A plugin Credential with a `service` binding needs a numeric `projectId`. If the OAuth client has a `projectId` that is not numeric, `POST /api/credentials` returns 422. An MCP Credential can use any safe `projectId`, but it cannot serve the Sentry route.

The Grave comes from the Credential `service` binding. The adapter reads the Grave from the Credential. It does not read the Grave from the DSN or from the event. An event field cannot set the Grave or the `projectId`.

The SDK sends standard Sentry envelopes to this route:

`POST /api/:projectId/envelope/`

The host does not change how the SDK sends its key. The adapter accepts the `sentry_key` query parameter, the envelope `dsn` field and the `Authorization: Sentry <key>` header. If the SDK sends more than one key, the keys must be equal, or the adapter returns 403. The adapter does these steps:

1. It checks the key and the number in the path.
2. It finds the Grave from the `service` binding of the Credential.
3. It redacts the event.
4. It publishes one `EventEnvelope`.

The adapter returns 403 in these cases:

- The SDK sends no key.
- The envelope `dsn` field is not a valid `http` or `https` URL that has a key.
- The SDK sends more than one key, and the keys are not equal.
- The key is not 64 lowercase hex characters.
- The key fails verification, because it is unknown, expired or revoked.
- The Credential is not a plugin Credential that has only the `events:publish` scope.
- The Credential has no `service` binding.
- The `projectId` of the Credential is not equal to the number in the path.

## Local development

The API binds to 127.0.0.1 by default. An SDK that runs on another machine cannot reach that address. Use a tunnel such as ngrok for local development.

1. Start the API on the local machine. The default port is 3000.
2. Start a tunnel to that port, for example with `ngrok http 3000`.
3. Use the HTTPS URL from the tunnel as `<api-host>` in the DSN. Keep the `<credential>` value and the `<project-id>` number. The `<project-id>` number is the `projectId` of the Credential.

This setup needs no real Sentry account, no real NATS, no real secret and no call to Sentry servers. A cloud subscription will provide a stable API host in v3. Until then, use a tunnel for local development.

## What v2 collects

In v2 the API collects every event the SDK sends.

- An `event` item maps to a valid `EventEnvelope`.
- Every other item type is skipped. This includes `session`, `client_report`, `attachment`, `transaction`, `span`, `profile`, replay and metric items. Unknown item types are skipped too.

Ticket #86 owns the next step: shaped telemetry, route fingerprints, trace handling and repository redaction rules. See [#86](https://github.com/The-Resonance-Team/graveshift/issues/86).

## Related documents

- [ADR 0014: Official Sentry SDKs with a custom DSN own Plugin telemetry](../adr/0014-official-sentry-sdks-for-supported-frameworks.md)
- [ADR 0018: Project-scoped state](../adr/0018-project-scoped-state.md)
- [#63: hex Credential issuance](https://github.com/The-Resonance-Team/graveshift/issues/63)
- [#71: Sentry envelope ingest adapter](https://github.com/The-Resonance-Team/graveshift/issues/71)
- [#86: shaped telemetry](https://github.com/The-Resonance-Team/graveshift/issues/86)
- [Architecture](../ARCHITECTURE.md)
