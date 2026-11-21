# Glossary Map

This file is an index. It lists each context, the terms it owns and the path to its glossary. Definitions stay in the `GLOSSARY.md` named in each row. The root `GLOSSARY.md` keeps system-wide terms. Each area glossary holds the terms of its own area.

## Area glossaries

| Area | Glossary path |
| --- | --- |
| `apps/api` | `apps/api/GLOSSARY.md` |
| `apps/daemon` | No domain terms |
| `packages/actuator` | `packages/actuator/GLOSSARY.md` |
| `packages/agents` | `packages/agents/GLOSSARY.md` |
| `packages/api-contract` | No domain terms |
| `packages/core` | `packages/core/GLOSSARY.md` |
| `packages/diagnoser` | `packages/diagnoser/GLOSSARY.md` |
| `packages/events` | No domain terms |
| `packages/fixer` | `packages/fixer/GLOSSARY.md` |
| `packages/gateway` | No domain terms |
| `packages/integrations` | `packages/integrations/GLOSSARY.md` |
| `packages/metrics` | No domain terms |
| `packages/notifier-discord` | `packages/notifier-discord/GLOSSARY.md` |
| `packages/patch` | `packages/patch/GLOSSARY.md` |
| `packages/plugin-nestjs` | No domain terms |
| `packages/policy` | No domain terms |
| `packages/redactor` | No domain terms |
| `packages/sources-docker` | No domain terms |
| `packages/sources-k8s` | No domain terms |
| `packages/watcher` | `packages/watcher/GLOSSARY.md` |

## Triage context

Owner areas: `packages/core` and `apps/api`.

Terms owned: Work item, Diagnosis, Triage, assignee, `needs_agent_<name>`, `needs_human`, auto-fix, Fix now, `fixPriority`, draft pull request.

Glossary path: `packages/core/GLOSSARY.md`. The definitions live there.

### States a work item moves through

Work item → Diagnosis → Triage (assignee: `needs_human` or `needs_agent_<name>`) → auto-fix or Fix now → draft pull request. `fixPriority` orders the fix queue.

## Events terms

The six terms below are indexed once each. Their definitions live in `apps/api/GLOSSARY.md`.

| Term | Context | Glossary path |
| --- | --- | --- |
| Event type | Events | `apps/api/GLOSSARY.md` |
| Subscription | Events | `apps/api/GLOSSARY.md` |
| Occurrence | Events | `apps/api/GLOSSARY.md` |
| Cursor | Events | `apps/api/GLOSSARY.md` |
| Delivery mode | Events | `apps/api/GLOSSARY.md` |
| Watermark | Events | `apps/api/GLOSSARY.md` |

The Events context is owned by `apps/api` with `packages/events`. AI Harness stays the chat-surface term in the root `GLOSSARY.md`. It is distinct from the Events term above that names the subscription surface.
