# Authentication and account requests

[فارسی](README.fa.md)

This partial Bruno collection covers the published authentication and account
HTTP routes. Other API areas will be added separately. Open this directory in
Bruno, create a local environment, and set `base_url` to your local API URL,
`origin` to an exact origin allowed by the server's `SERVER_ALLOWED_ORIGINS` or
`SERVER_ALLOWED_ORIGIN` configuration, and `access_token` to an initially empty
value. The allowed origin may differ from `base_url`; include its scheme and port
when configured. The collection sends it as `Origin` so requests with session
cookies pass the server's origin check. Do not commit that environment or
real credentials. Successful login saves the access token in the active Bruno
environment. Session cookies are also used by the authentication adapter.
The exact publication-snapshot check rejects local environment directories; run
the full validation gate in a clean checkout without a Bruno environment.

The saved JSON examples illustrate responses when the persisted system language
is English. The system setting, not `Accept-Language`, selects the response
language. Errors contain a translated `message`; bodyless success responses have
no JSON example. Responses include the `X-Request-Id` correlation header.

For a mobile change, request a code for the new number and then include the
same `mobile` and its `otp` in the profile update. The local runtime uses a
configured development code: production OTP delivery is not implemented.
Issue and confirm the code in the same session.
Use synthetic accounts and values with a disposable local server. See
[HTTP transport](../docs/http-transport.md) and
[authentication adapters](../docs/auth-adapters.md).
