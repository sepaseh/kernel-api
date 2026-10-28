# API trust boundaries and threats

[English](threat-model.md) · [فارسی](threat-model.fa.md)

This model describes the published local-runtime snapshot, not a completed
production assessment. The API owns authentication, authorization, persistence
and object storage; independent clients use its HTTP contracts. Operators own
the host, network, secrets, storage configuration and release process.

## Assets and boundaries

- Protect passwords, OTPs, sessions and secrets from disclosure or reuse;
  account and administrative operations must use the current authenticated actor.
- Roles, permissions and the last active system administrator protect management
  operations. Concurrent changes must not bypass persistence invariants.
- Business data and file metadata are protected by database constraints and
  transaction checks. Object bytes, including private objects, cross a separate
  storage boundary and may need compensation if a metadata write fails.
- The HTTP boundary handles untrusted input, browser origins and bounded request
  bodies. Logs should support incident investigation without credentials, raw
  request paths or provider error details.
- Local and MinIO storage cross an operator-controlled filesystem or network
  boundary. Local storage requires a directory controlled by the API process;
  lexical path checks cannot prevent a host user from inserting symlinks. MinIO
  requires owned buckets and TLS outside `localhost` or literal loopback endpoints.

## Important scenarios

Browser mutations with an untrusted Origin are rejected. A mutation without an
Origin is also rejected when it carries a cookie or browser fetch metadata;
absence of Origin alone is not a general authorization mechanism. Authorization
and active-session checks remain necessary for both browser and non-browser
clients. See [HTTP transport](../http-transport.md).

Changing a mobile number verifies only the **new** number. Updating another
user's number requires `users.update` and an active system administrator; an
administrator who controls the replacement number can change it without the
account owner's consent. The operator must account for this recovery risk. The
OTP is bound to the actor, session, target and old and new numbers, with the
authorization and update rechecked transactionally.

Production OTP delivery is not implemented. The local authentication limiter
is per process, and privileged changes to bucket configuration can race storage
checks. Tests against synthetic local fixtures do not demonstrate protection from
distributed abuse, a deployed MinIO service or a production incident. See
[authentication adapters](../auth-adapters.md), [object storage](../object-storage.md)
and the [security review checklist](reviews.md).
