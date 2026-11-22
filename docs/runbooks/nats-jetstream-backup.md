# Runbook: back up and restore GRAVESHIFT_EVENTS

This runbook covers the one NATS JetStream stream in platform v2:
`GRAVESHIFT_EVENTS`. The design is in
`docs/reports/2026-11-22-nats-jetstream-deployment.md`. The code defines the
stream name once in `packages/events/src/streams.ts`.

Run these steps on the self-hosted platform. No daemon runs in GitHub Actions.

## Before you start

- Use the official NATS CLI and a pinned server version.
- Use an operator NKey from the secret store. Do not put a credential in the
  snapshot directory.
- Keep the NATS auth material and the server config in an encrypted secret
  store. A snapshot without the auth material cannot be read.
- PostgreSQL holds work items, the audit chain and Credentials. Use its own
  backup path. This runbook covers Event occurrences and Cursors only.

## Daily snapshot

1. Take a dated snapshot. Keep the consumer state:

   ```sh
   nats backup stream GRAVESHIFT_EVENTS ./backups/graveshift-events/<date> --consumers
   ```

   Older CLI versions use `nats stream backup` with the same flags.

2. Encrypt the directory and copy it off the host:

   ```sh
   tar -C ./backups/graveshift-events -czf - <date> | age -r <recipient> -o <date>.tar.gz.age
   ```

   Store the encrypted file in off-site storage. A snapshot beside the live
   store does not survive a disk loss. Use a recipient key from the secret
   store; do not write the key into this repository.

3. Keep seven daily snapshots. Remove older copies after the next valid
   snapshot.

## Validate a snapshot

On NATS server 2.15 and later, check a backup before you rely on it:

```sh
nats backup validate ./backups/graveshift-events/<date>
nats backup info ./backups/graveshift-events/<date> --subjects
```

Record the message count, the last sequence and the subject list. Do not
overwrite a valid snapshot with an unchecked one.

## Restore a snapshot

Restore only when the stream is gone. The stream name comes from `backup.json`
in the snapshot. A restore does not rename a stream.

1. Check that the stream is absent:

   ```sh
   nats stream info GRAVESHIFT_EVENTS
   ```

   If the stream still holds data, stop. Do not replace live data.

2. Restore the snapshot:

   ```sh
   nats backup restore stream ./backups/graveshift-events/<date>
   ```

3. Verify the restored stream against the recorded values:

   ```sh
   nats stream info GRAVESHIFT_EVENTS
   ```

   Match the message count and the last sequence against the snapshot. Check
   that the durable consumer `graveshift-watcher` is present with its delivered
   state. If any value differs, stop and report the difference.

4. After verification, resume normal ingest. Consumers deduplicate by envelope
   id, so a replay of a retained envelope is safe.

## Secrets

No credential, TLS key or password is in the snapshot directory. Copy the
server config and the NATS auth material separately into the encrypted secret
store. Rotate a credential that was ever written to a snapshot or a log.
