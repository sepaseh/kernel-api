# Authentication adapters

The authentication adapters connect Better Auth, credential persistence and OTP
persistence to the application. The local Node server connects them to
[HTTP routes](http-transport.md). Adapter and HTTP suites use synthetic
configuration and disposable databases.

## Credentials and sessions

Better Auth uses the database-owned user, account and session records. The
stored internal email identifies the credential and does not change with a mobile
number. New internal emails are random; legacy values are preserved. Password
changes verify the actor's active session and credential ownership inside the
transaction. Password recovery binds the OTP to the account at issuance and
checks that the same active account still owns the destination mobile in the
reset transaction. Failure rolls back OTP consumption and credential changes.

To provision an administrator for a database with no users, follow
[administrator provisioning](development.md#database-initialization-and-administrator-provisioning).
The command creates the user and credential in one transaction and leaves
session creation to login.

## OTP issuance and verification

The current OTP adapter issues a fixed code with explicit development or test
configuration. Issuance fails without that configuration. Production delivery
requires a delivery adapter and operational verification.

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
