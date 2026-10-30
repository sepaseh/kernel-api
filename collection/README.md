# Kernel API — Bruno Collection

[فارسی](README.fa.md)

The collection contains API operations used by the Kernel applications and
saved response examples. The published requests cover authentication, account,
users, roles, calendar, files, languages, and settings.

## Open the collection

1. Install and open Bruno.
2. Choose **Open Collection**.
3. Select this `collection` directory.
4. Select an existing local environment, such as **development**, or create one.
   Set `base_url` to the local API URL, `access_token` initially empty, and
   `origin` to an exact origin allowed by `SERVER_ALLOWED_ORIGINS` or
   `SERVER_ALLOWED_ORIGIN` on the server. The allowed origin may differ from
   `base_url`; include its scheme and port when configured. The collection sends
   it as the `Origin` header so requests with session cookies pass the server's
   origin check. For individual resources, set `user_id`, `role_id`, and
   `file_id` to synthetic identifiers created on the disposable local server.
   For calendar deletion, set `calendar_date` in the active environment to the
   date to remove in `YYYY-MM-DD` format.
   Select a synthetic local file in Bruno before sending the upload request.

Keep local environments and real credentials out of version control. The exact
publication-snapshot check rejects local Bruno environment directories; run the
full validation gate in a clean checkout without a Bruno environment.

## Included requests

- Authentication: register, login, OTP request, refresh token, forgot password,
  change password, and logout.
- Account: current account, profile and username updates, and email verification.
- Calendar: list, create, and delete configured dates.
- Roles: list, create, details, update, and delete.
- Permissions: role-scoped list.
- System settings: public details and authenticated update.
- Languages: authenticated list of supported languages.
- Files: multipart upload used by application logos.
- Users: list, create, details, update, delete, status, system-admin, password,
  roles, and mobile verification.

Clients may restore an in-memory token through `/auth/refresh-token`; the
request is included even when the shared API client handles it without a feature
page. Session cookies are also used by the authentication adapter.

## First run

Run the login request with a local test account. Its post-response script stores
the returned access token as `access_token` in the active environment. The
remaining authenticated requests use that token.

Saved response files sit beside each request and are named after their HTTP
status code. Saved error examples use English messages; successful settings
examples illustrate a system with Persian as its active language. Bodyless
successes have no JSON example.

Authentication and mobile-change operations can return `429`. Saved
`429.json` examples demonstrate one applicable error; code-issuance cooldowns
and the in-process attempt limiter can return different messages. See the
[HTTP transport limits](../docs/http-transport.md) for scopes and `Retry-After`.

To change your own mobile number, request a code using
`POST /account/request-mobile-verification`, then send the same `mobile` and
its `otp` to `PATCH /account/update-profile`. To change a user's number through
management, use `POST /users/{{user_id}}/request-mobile-verification` followed
by `PATCH /users/{{user_id}}` with the same `mobile` and its `otp`. Management
requires `users.update`; changing another user's number requires a system
administrator. Issue and confirm the code in the same session, for the same
user and flow. The local runtime uses a configured development code: production
OTP delivery is not implemented. Use synthetic accounts and values with a
disposable local server. See [HTTP transport](../docs/http-transport.md) and
[authentication adapters](../docs/auth-adapters.md).

Responses from the initialized HTTP app, including errors, preflight responses,
and file content, include `X-Request-Id`. The initial 503 response before the
app is ready does not include this header. Clients may send a value of 1–128 ASCII
letters, digits, underscores, hyphens, or equals signs. Missing or invalid values
are replaced with a UUID. Values that would be redacted as sensitive text (for
example a mobile number or `token=...`) are also replaced, so the returned ID and
the logged ID always agree. The returned header is the identifier used in server
logs; it is correlation metadata, not proof of identity. CORS allows this request
header and exposes it on responses. JSON response bodies are unchanged.

Unexpected authentication-provider, database, and storage failures return `500`
with the translated generic internal-error message, never a stack or SDK payload.
Expected credential and validation failures retain their documented `400`
responses. In particular, login, registration, password change, and user creation
do not turn unexpected infrastructure failures into validation errors.

Do not store real passwords or access tokens in this shared collection.

## Local backend integration

The standalone backend implements these contracts under `src`. Use `npm run dev`
with explicit synthetic configuration; the command does not automatically load
an environment file. Consult
the [development guide](../docs/development.md) for local execution and the
[validation manifest](../.agents/validation.json) for checks. Saved responses do
not drive runtime output; update both the collection and the matching Hono route
when behavior changes.

See the [collection and backend integration guide](../.agents/rules/api-collection.md)
for source-of-truth rules, change sequencing, and ownership.

## Shared HTTP contract

The executable operation requests remain in this collection. Feature-owned wire
DTOs and constants live in `src/contracts/`.

- JSON request bodies require `Content-Type: application/json` and are limited to
  64 KiB, including streamed bodies without Content-Length. Invalid media type
  returns 415; oversized JSON returns 413. File uploads retain their own limit.
- Browser mutations require an exact configured Origin. Untrusted Origins and
  cookie mutations without Origin return 403. Nonbrowser clients with no ambient
  cookie/fetch metadata can continue using the existing bearer requests.
- The persisted `settings.language_code` selects API response language from all
  ten registered codes: `ar`, `de`, `en`, `es`, `fa`, `fr`, `it`, `pt`, `ru` and
  `tr`. Request language headers, including `Accept-Language`, and visitor
  cookies cannot override that setting. Responses passing language initialization include `Content-Language`.
- Auth and account route processing sets `Cache-Control: private, no-store` after CORS and origin checks; preflight or earlier errors may omit it.
- Login has a bounded single-process backstop of 20 attempts per identity per
  15 minutes. Registration, OTP issue, recovery, email verification confirmation, and mobile-change OTP
  issue and confirmation have 10 attempts per scope and identity (or actor/target)
  per 15 minutes, in addition to OTP's 120-second resend cooldown. The in-process limiter returns 429 with Retry-After; the independent
  OTP resend cooldown can return 429 without that header. This is not a
  distributed/IP-based limiter;
  shared deployments must supply an ingress/shared-store abuse policy.
- Password change/reset invalidates all previous sessions. Logout is idempotent
  and expires the actual Better Auth cookies, including HTTPS secure names.

After initialization, errors handled by the API error serializer use
`{ "message": "translated message" }` and include `X-Request-Id`; the initial
readiness `503` is bodyless and omits that header. New shared HTTP errors are documented here rather than repeated as
operation-specific response fixtures.
