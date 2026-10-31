# Coordinated database and object recovery

[English](backup-restore.md) · [فارسی](backup-restore.fa.md)

Choose an owner, schedule, retention, acceptable data-loss window and recovery
objective for the actual service. Kernel provides this procedure and a
[synthetic isolated recovery drill](backup-restore.md#isolated-recovery-drills), not automated production
backups, an operator restore command or a promised recovery time. Never rehearse against the
developer data or an active production database.

Preserve one matched recovery point: SQLite plus remaining WAL/journal sidecars,
all local-private/local-public objects or both MinIO buckets and access policies,
release/migration identity, driver/paths/origins and protected secret-store version
references. SQLite holds metadata only; DB-only restoration cannot reconstruct
uploads. Protect backups containing credential hashes, personal data, sessions
and private objects. Recover secrets through the protected secret store separately.

1. Record release ID, migration level, selected storage and resolved paths. Pause
   all writes and direct storage writers; stop API and prevent supervisor restart.
2. After confirmed clean shutdown, copy the closed SQLite file and any associated
   journal/WAL files together. Never copy only the main file while writers run.
3. Capture the complete local object tree, or both MinIO buckets with keys, content
   types and public/private policies. Changing driver never converts old metadata.
4. Store backups outside live data/release directories. Record timestamp, sizes,
   checksums, counts and read-only object-reference inventory in a protected manifest.
   Verify completion before restarting the original instance and checking health.
5. Restore into NEW isolated DB/storage locations using the matching release and
   protected configuration. Disable development seed and preserve backup originals.
6. Before API startup, run `PRAGMA integrity_check` (expect ok) and
   `PRAGMA foreign_key_check` (expect no rows) on the restored SQLite copy. Verify
   migration history; startup applies pending migrations, so rehearse upgrades on
   a further copy rather than overwriting the recovery point.
7. Start the isolated API; check health, authorized login, roles, settings, calendar,
   counts and every referenced object. Verify private objects remain inaccessible
   publicly and public logos/content types match. Record recovered data timestamp,
   elapsed recovery time and discrepancies before approving the recovery point.

Restoration also restores old sessions and OTP records. Decide whether to revoke
them before returning service, particularly after an authentication incident.
For a real restoration, pause writers again, preserve outgoing state and switch
to the approved matching DB/object pair; repeat checks before reopening traffic.
Do not merge recovery points or downgrade data by editing migration files.
[Release operations](release-operations.md) explains activation and rollback.

## Isolated recovery drills

Run `npm run test:recovery` from this checkout. The command runs three executable
acceptance cases in [recovery-drill.test.ts](../src/test/integration/recovery-drill.test.ts).
They also run inside the required `test:coverage` gate and CI. No additional dependency, Docker engine,
browser, external bucket, real environment file or production service is needed.

The cases create a uniquely named `kernel-recovery-drill-*` directory directly
under the system temporary directory. Configuration is explicitly synthetic;
there are no input path arguments and development seeding is disabled. Every
client is closed and the verified temporary tree is removed by the parent after
its bounded worker process exits, releasing native Windows SQLite handles,
including failures. No database, credential, upload or report is retained.

### Matched restore

The fixture creates a real migrated SQLite database and local public/private
objects through the real HTTP upload contract. A real login session, role and
permission assignment, calendar entry and Persian language setting are captured.
The exercise then:

1. Closes the source database before hashing/copying its complete DB/object tree,
   including any remaining journal sidecars, into a separate recovery point.
2. Makes the outgoing synthetic database/object state unusable, then restores
   from the recovery point into a new independent tree.
3. Verifies the complete SHA-256/file-size inventory. Missing or changed objects
   and a valid SQLite database from a different point are rejected.
4. Runs SQLite integrity/foreign-key checks and compares migration fingerprints
   before initialization. Initialization must leave the recovered migration
   history and configured language unchanged.
5. Uses the recovered session through the real HTTP API, verifies permissions and
   calendar data, reads the exact public bytes/content type, and confirms private
   bytes remain present while their public HTTP route returns 404.
6. Rechecks that the original recovery point was not changed by startup or reads.

This is an offline synthetic local-storage rehearsal. It is not a production
backup program, scheduler, MinIO bucket/policy restore, cross-version migration
rehearsal, measured recovery-time promise or signed backup verification system.
Follow the [operator recovery procedure](backup-restore.md) for actual backups,
including confidentiality, retention, secret-store recovery and the decision to
revoke restored sessions/OTP records after an authentication incident.

### Synthetic storage incident

An injected failing storage adapter fails a real authenticated multipart upload. The case
checks the client-observed HTTP 500 and `X-Request-Id`, then finds the same request
ID and immutable synthetic release in `storage.operation.failed`,
`file.upload.failed` and exactly one `api.request.completed` event. It verifies
the storage stage, generic error behavior, lack of partial file metadata and
absence of the session token, password, auth secret and provider payload in logs.
Uploading through the separate app with the healthy local storage adapter succeeds
and produces a correlated HTTP 201 completion event.

The client here is Hono's real in-process HTTP request interface. The exercise
does not launch a browser, collector, alerting service or production incident.
Downstream deployments still need their browser error evidence, log transport,
ownership and escalation procedures. See [HTTP transport](http-transport.md)
for the published request-ID and error-handling behavior.
