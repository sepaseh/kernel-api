# HTTP transport adapters

The Hono adapters translate HTTP requests into application operations.
Use the [Bruno collection](../collection/README.md) for the method, fields and
responses of a specific operation. See [local development](development.md) for
startup and the [client handoff](collection-guide.md#client-screen-contract-handoff)
for contract changes that affect independent frontends.

## Readiness and shared responses

The listener binds before database or storage initialization. Until ready it
serves bodyless 503 responses with `Cache-Control: no-store`; an occupied port
fails before those resources initialize. Initialized application responses use
the HTTP adapters and their request/error logging. Local startup, cleanup and
shutdown tests use disposable fixtures.

Adapters validate input, map semantic errors to localized status responses,
enforce authorization and origin checks, and log request identifiers without
credentials or raw paths. The error serializer returns a JSON
`{ "message": "translated message" }` envelope. Unexpected provider, database
and storage failures return a generic translated 500. Responses are labeled with
`Content-Language` after language resolution and use the persisted language.
See [API localization](localization.md).

Initialized responses include `X-Request-Id`, including CORS preflight and
file responses. The initial readiness 503 omits this header. See
[request correlation](backend-logging.md#request-correlation).

## Origins and caching

Mutations require an exact configured origin when the client sends `Origin`,
`Cookie` or `Sec-Fetch-Site`. A missing required origin or a supplied untrusted
origin returns 403. Nonbrowser bearer requests can omit `Origin` when they send
neither cookies nor Fetch Metadata.

Authentication, accounts, calendar, categories, contents, FAQs, languages,
users, roles, and file management responses carry
`Cache-Control: private, no-store` after CORS and the origin check. Public
`GET /settings` sends `Cache-Control: no-store`. Public file content from
`GET /files/:fileId/content` sends `Cache-Control: public, max-age=3600`.
Preflight and earlier failures can omit the route's cache header.

## Authentication attempt limits

The attempt limiter runs within a single process. Shared deployments need
independent ingress or shared-store throttling.

The bounded in-process limiter retains active identity windows until expiry. At
its 10,000-window capacity, new identities are rejected until space becomes
available. Deliberate saturation can still deny service, so independent ingress
or shared-store throttling is essential.

Login accepts either `identifier` or `mobile` with the password. The API uses
`identifier` when both fields are included. Both forms share the limit of 20
attempts per trimmed mobile number and immediate transport peer address in a
15-minute window. Clients behind one NAT or reverse proxy share a
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
flows use explicit fixed-code configuration. Coordinate rollout and rollback
with independently deployed consumers so they request a code and submit `otp`
before changing a number.

## File uploads

File uploads are authenticated before reading multipart data. The transport
counts actual streamed bytes rather than trusting `Content-Length`, and caps the
whole multipart body at the server upload limit plus 64 KiB of framing and
fields. The application applies the file and [context limits](object-storage.md#upload-contexts)
after parsing. Body reading has a 60-second deadline. An incomplete body at the
deadline is canceled and receives a localized
[`408` response](../collection/files/upload/408.json).
The process handles up to four uploads at once, counting each from before
multipart reading through the storage and metadata writes. An authenticated
request arriving at capacity receives a localized, non-cacheable
[`503` response](../collection/files/upload/503.json) before the body is read.
See [object storage](object-storage.md) for file visibility, content covers
and deletion.
