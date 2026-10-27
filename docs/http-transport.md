# HTTP transport adapters

[English](http-transport.md) · [فارسی](http-transport.fa.md)

The HTTP transport phase adds Hono route adapters over the existing application
services. It is not a runnable server: composition, startup, deployment and
production OTP delivery require later review. Frontends communicate over HTTP
and incompatible contract changes require coordinated rollout.

Adapters validate input, map semantic errors to localized status responses,
enforce authorization and origin checks, and log request identifiers without
credentials or raw paths. The authentication attempt limiter is local to a
single process and cannot enforce distributed rate limits; production ingress
must provide independent throttling.

The bounded in-process limiter retains active identity windows until expiry. At
its 10,000-window capacity, new identities are rejected until space becomes
available. Deliberate saturation can still deny service, so independent ingress
or shared-store throttling is essential.

## Mobile number changes

Mobile changes require proof of control of the **new** number before the update:

| Flow            | Request a code                                    | Confirm the change              |
| --------------- | ------------------------------------------------- | ------------------------------- |
| Own profile     | `POST /account/request-mobile-verification`       | `PATCH /account/update-profile` |
| User management | `POST /users/:userId/request-mobile-verification` | `PATCH /users/:userId`          |

Both request endpoints accept JSON `{ "mobile": "..." }` and return
`{ "expires_in": ..., "remaining_seconds": ... }`. To confirm, send JSON
containing `{ "mobile": "...", "otp": "..." }` to the corresponding PATCH;
optional `first_name` and `last_name` changes may accompany it. The code is
required when the number actually changes. Keep the authenticated session active
through both steps.

The profile flow applies only to the signed-in account. Management endpoints
require `users.update`; changing another account's number additionally requires
a currently active system administrator. An administrator changing another
account can prove control of the new number without the existing account owner's
consent: the code does **not** verify the old number or obtain that owner's
approval. Operators and clients must account for this deliberate risk.

The code is bound to the flow, actor, session, target, old number and new number.
Confirmation rechecks the active session and authorization, consumes the code
and updates the number in one transaction. Expired, incorrect, already consumed,
or mismatched codes are rejected; a failed update does not partially consume the
code. Existing internal authentication identity is preserved.

Production OTP delivery is not available in this phase. Clients must not assume
that a code can be delivered in production or that publishing these adapters makes
the API runnable. This is an incompatible change to mobile-update behavior:
coordinate API and independently deployed consumer rollout and rollback, so
clients request a code and submit `otp` before a number change.

File uploads are authenticated before reading multipart data. The transport
counts actual streamed bytes rather than trusting `Content-Length`, and caps the
whole multipart body at the configured file limit plus 64 KiB of framing and
fields. The application independently validates the resulting file bytes.
Tests exercise synthetic service ports and a local Node HTTP bridge, not the
future production network adapter or a deployed storage integration. Coordinate
rollout and rollback with independently deployed HTTP clients; do not infer that
the endpoint is usable before composition and a server entry point are published.
