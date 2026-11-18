# DEMO (STUB)

> Scaffold only. Full demo spec is in bootstrap doc section 12. Replace this stub.

Demo app: `examples/haunted-candy-shop` (Fastify api + worker + Postgres), with `/healthz` and `/metrics`.

Fault scenarios to document (see section 12):

| Scenario | Fault | Expected outcome |
| --- | --- | --- |
| `null-candy` | null `price` -> TypeError -> 5xx | draft PR with null guard + test |
| `memory-leech` | worker leaks -> OOM / restart loop | Discord Bless -> rollout restart + draft PR |
| `wrong-potion` | bad `DATABASE_URL` -> unhealthy | draft PR reverting config |
| `slow-curse` (stretch) | missing index -> high p95 | draft PR adding index |
| `image-ghost` (K8s stretch) | bad image tag -> ImagePullBackOff | propose rollback image (Bless) |

`bun run demo:reset` will restore health, close demo PRs and archive incidents (owner-only). The script arrives with the demo implementation.
