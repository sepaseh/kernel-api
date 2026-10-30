# API requests

[فارسی](README.fa.md)

This Bruno collection covers authentication, account, users, roles, calendar,
files, languages and settings HTTP routes. Open this directory in
Bruno, create a local environment, and set `base_url` to your local API URL,
`origin` to an exact origin allowed by the server's `SERVER_ALLOWED_ORIGINS` or
`SERVER_ALLOWED_ORIGIN` configuration, and `access_token` to an initially empty
value. The allowed origin may differ from `base_url`; include its scheme and port
when configured. The collection sends it as `Origin` so requests with session
cookies pass the server's origin check. Do not commit that environment or
real credentials. Successful login saves the access token in the active Bruno
environment. Session cookies are also used by the authentication adapter.
Set `user_id`, `role_id` and `file_id` to synthetic identifiers created in the
disposable local server before running operations that reference those records.
Set `calendar_date` in the active environment to the `YYYY-MM-DD` date to remove
before using the calendar deletion request.
Select a synthetic file locally in Bruno before sending the upload request.
The exact publication-snapshot check rejects local environment directories; run
the full validation gate in a clean checkout without a Bruno environment.

The saved error examples use English messages. Successful settings examples
illustrate a system configured with Persian as its active language. The system setting, not `Accept-Language`, selects the response
language. Errors contain a translated `message`; bodyless success responses have
no JSON example. Responses from the ready application include the `X-Request-Id` correlation header. An initial `503` response before the application is ready may omit this header.

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
OTP delivery is not implemented.
Use synthetic accounts and values with a disposable local server. See
[HTTP transport](../docs/http-transport.md) and
[authentication adapters](../docs/auth-adapters.md).
