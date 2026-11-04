# Authentication adapters

The authentication adapters provide Better Auth, credential and OTP persistence,
database initialization and initial administrator provisioning. These owners are
published in the database-persistence phase. HTTP routes and the local Node
server composition belong to a later publication; adapter tests do not establish
HTTP behavior or deployment readiness.

Better Auth uses the database-owned user, account and session records. The
stored internal email identifies the credential and does not change with a mobile
number. New internal emails are random; legacy values are preserved. Password
changes verify the actor's active session and credential ownership inside the
transaction. Password recovery binds the OTP to the account at issuance and
checks that the same active account still owns the destination mobile in the
reset transaction. Failure rolls back OTP consumption and credential changes.

The initial administrator command reads JSON from standard input, refuses an
existing user database, and creates the user and credential atomically without
creating a session. Tests must use disposable synthetic databases and explicit
synthetic configuration; never point tests at an existing environment or database.

The current OTP adapter has no delivery provider. Its fixed code is restricted to
explicit development or test configuration. Issuance without that configuration
fails; this is not evidence of a production OTP delivery path. A real delivery
adapter and its operational tests are required before using those flows in production.

New OTP records use a versioned HMAC-SHA256 digest. Only the newest record for
the destination, purpose and subject, where applicable, can verify. A new code
can supersede an older unexpired code in that scope. Legacy digests remain
eligible where the purpose supports them. Password reset requires an
account-bound code, so older unbound reset codes must be replaced.

Older versions cannot verify records written using newer digest formats.
Coordinate rollout and rollback across instances, then request and use the
newest code from the version serving verification. Existing records are not
rewritten. A new request may be throttled until the existing 120-second
issuance window ends.
