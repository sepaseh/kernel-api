# Authentication adapters

[English](auth-adapters.md) · [فارسی](auth-adapters.fa.md)

This proposed phase adds Better Auth, credential persistence, OTP persistence,
database initialization and initial administrator provisioning. The API HTTP
server and application composition remain unpublished; this phase alone does not
make the application deployable.

Better Auth uses the database-owned user, account and session records. The
stored internal email identifies the credential and does not change with a mobile
number. New internal emails are random; legacy values are preserved. Password
changes verify the actor's active session and credential ownership inside the
transaction. Password recovery binds the OTP destination to the user's current
mobile inside the transaction; failure rolls back OTP consumption and credential
changes.

The initial administrator command reads JSON from standard input, refuses an
existing user database, and creates the user and credential atomically without
creating a session. Tests must use disposable synthetic databases and explicit
synthetic configuration; never point tests at an existing environment or database.

The current OTP adapter has no delivery provider. Its fixed code is restricted to
explicit development or test configuration. Issuance without that configuration
fails; this is not evidence of a production OTP delivery path. A real delivery
adapter and its operational tests are required before using those flows in production.
