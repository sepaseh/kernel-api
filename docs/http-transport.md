# HTTP transport adapters

The local API wires the Hono route adapters to the existing
application services and concrete infrastructure through manual composition.
It includes a local Node server entry point, runnable with explicit configuration
through `npm run dev` or `npm start`. Local execution does not establish deployment
readiness or production OTP delivery. Frontends communicate over HTTP and
incompatible contract changes require coordinated rollout.

The listener binds before database or storage initialization. Until ready it
serves bodyless 503 responses with `Cache-Control: no-store`; an occupied port
fails before those resources initialize. Initialized application responses use
the HTTP adapters and their request/error logging. Local startup, cleanup and
shutdown tests use disposable fixtures, not an operator's environment or data.

Adapters validate input, map semantic errors to localized status responses,
enforce authorization and origin checks, and log request identifiers without
credentials or raw paths. The authentication attempt limiter is local to a
single process and cannot enforce distributed rate limits; production ingress
must provide independent throttling.

The bounded in-process limiter retains active identity windows until expiry. At
its 10,000-window capacity, new identities are rejected until space becomes
available. Deliberate saturation can still deny service, so independent ingress
or shared-store throttling is essential.

Login is limited to 20 attempts per identifier and immediate transport peer
address in a 15-minute window. Clients behind one NAT or reverse proxy share a
source. The listener ignores forwarded client headers, and in-process requests
without a transport peer share a fallback source. Registration, OTP issuance,
password recovery and email-verification confirmation are each limited to 10
attempts per scope and identity in the same window. Mobile-change
code requests and confirmations are limited to 10 attempts per scope and
actor/target pair. A PATCH containing `mobile` consumes an attempt even when the
number is unchanged. These are process-local limits.

The attempt limiter returns `429` with `Retry-After` in seconds. OTP issuance
also has a separate 120-second resend cooldown; that `429` can have a different
message and need not include `Retry-After`. Email-verification code requests use
the OTP cooldown; the attempt limit applies to email-verification confirmation.

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

Production OTP delivery is not available in this phase. Local development/test
flows use explicit fixed-code configuration; clients must not assume a production
delivery path. This is an incompatible change to mobile-update behavior:
coordinate API and independently deployed consumer rollout and rollback, so
clients request a code and submit `otp` before a number change.

File uploads are authenticated before reading multipart data. The transport
counts actual streamed bytes rather than trusting `Content-Length`, and caps the
whole multipart body at the configured file limit plus 64 KiB of framing and
fields. Body reading has a 60-second deadline. An incomplete body at the
deadline is canceled and receives a localized
[`408` response](../collection/files/upload/408.json). The deadline covers
receiving the body. The application independently validates the file bytes.
The process handles up to four uploads at once, counting each from before
multipart reading through the storage and metadata writes. An authenticated
request arriving at capacity receives a localized, non-cacheable
[`503` response](../collection/files/upload/503.json) before the body is read.
Tests exercise synthetic service ports and the local Node adapter with disposable
fixtures, not a deployed storage integration. Coordinate rollout and rollback
with independently deployed HTTP clients; a local server test does not establish
production readiness.
