# NATS stream definitions

These files hold the one stream and the one detection consumer for platform v2.
The values are defined in code at `packages/events/src/streams.ts`. A test in
`packages/events/src/config-files.test.ts` checks that these files match that
code. Do not edit a value here without editing the code first.

- `graveshift-events.stream.json` — stream `GRAVESHIFT_EVENTS` on `graveshift.>`.
- `graveshift-watcher.consumer.json` — durable consumer `graveshift-watcher`.
- `nats.conf` — server config: file store, TLS, two users, private bind, and
  MQTT, leafnode and WebSocket disabled.

Apply the definitions with the NATS CLI. Use an operator NKey from the secret
store. Do not write a credential into these files.

```sh
nats stream add --config graveshift-events.stream.json
nats consumer add GRAVESHIFT_EVENTS --config graveshift-watcher.consumer.json
```

## Local config check

After you edit `nats.conf`, parse it with the real NATS server on your local
machine. `nats-server -t` reads the config and exits; it starts no daemon.

```sh
brew install nats-server   # once, on the local machine
bun scripts/check-nats-config.ts
```

The script uses a throwaway certificate and fake credentials for the parse. It
never reads the secret mount. This check is local only; GitHub Actions does not
run it, so no daemon or long-running server runs in CI.

The backup and restore runbook is at `docs/runbooks/nats-jetstream-backup.md`.
