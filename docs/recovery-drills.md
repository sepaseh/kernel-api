# Isolated recovery and incident drills

[English](recovery-drills.md) · [فارسی](recovery-drills.fa.md)

Run `npm run test:recovery` from this checkout. The command runs three executable
acceptance cases in [recovery-drill.test.ts](../src/recovery-drill.test.ts).
They also run inside the required published `test:coverage` gate and CI. No additional dependency, Docker engine,
browser, external bucket, real environment file or production service is needed.

The cases create a uniquely named `kernel-recovery-drill-*` directory directly
under the system temporary directory. Configuration is explicitly synthetic;
there are no input path arguments and development seeding is disabled. Every
client is closed and the verified temporary tree is removed by the parent after
its bounded worker process exits, releasing native Windows SQLite handles,
including failures. No database, credential, upload or report is retained.

## Matched restore

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

## Synthetic storage incident

An injected storage port fails a real authenticated multipart upload. The case
checks the client-observed HTTP 500 and `X-Request-Id`, then finds the same request
ID and immutable synthetic release in `storage.operation.failed`,
`file.upload.failed` and exactly one `api.request.completed` event. It verifies
the storage stage, generic error behavior, lack of partial file metadata and
absence of the session token, password, auth secret and provider payload in logs.
Replacing the failing port with local storage restores a successful upload and
a correlated HTTP 201 completion event.

The client here is Hono's real in-process HTTP request interface. The exercise
does not launch a browser, collector, alerting service or production incident.
Downstream deployments still need their browser error evidence, log transport,
ownership and escalation procedures. See [HTTP transport](http-transport.md)
for the published request-ID and error-handling behavior.
