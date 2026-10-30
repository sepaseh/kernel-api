# Authentication and session review

[English](authentication-review.md) · [فارسی](authentication-review.fa.md)

Use this checklist when changing authentication, sessions or related operations.
It describes review questions and existing boundaries; it does not certify an
external audit or production readiness.

1. For authenticated operations, check that the actor has an active session
   and any required current permission at the point of the operation. Login and
   password recovery do not require an existing session; review their credential
   or OTP checks instead. For changes to another user's mobile, require the
   active system-administrator guard and account for verification of the new
   number only.
2. Check OTP purpose, destination and expiry. For mobile changes, also check
   binding to actor, session and target, and that failed verification or update
   cannot partially consume a code. Production delivery is not provided by the
   current adapter.
3. For password changes, recovery and administrative resets, examine credential
   ownership, transaction rollback and revocation of prior sessions. Do not
   equate a client refresh failure with server-side session revocation.
4. Check browser Origin and CORS rules, cookie attributes and response/log
   redaction. The authentication attempt limiter is process-local, not a shared
   distributed control.
5. Verify initial administrator provisioning uses protected JSON standard input,
   refuses an existing user database, creates the identity atomically and does
   not issue a session. Tests must use disposable synthetic databases.
6. Assess incompatible HTTP changes and rollout with independent clients. Local
   tests do not prove that a deployed client, OTP provider or infrastructure is
   configured correctly.

See [authentication adapters](../auth-adapters.md), [mobile-update behavior](../http-transport.md#mobile-number-changes),
[threat model](threat-model.md), and the integration tests
[`auth-bootstrap-integration.test.mjs`](../../scripts/auth-bootstrap-integration.test.mjs)
and [`auth-identity-integration.test.mjs`](../../scripts/auth-identity-integration.test.mjs).

The offline bootstrap reads protected JSON STDIN, rejects invalid input before
opening DB, disables seeding and refuses every preexisting user. No session/token
is issued. Production prevalidation is a required separate operator step.
