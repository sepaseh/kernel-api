# ADR 0004: Session consumers and cookie boundary

[English](0004-cookie-proxy-and-sessions.md) · [فارسی](0004-cookie-proxy-and-sessions.fa.md)

Status: accepted HTTP/session contract. Independently maintained consumers may use
bearer tokens or an HttpOnly-cookie proxy. Preserve official native Set-Cookie
headers and secure cookie names; a proxy can avoid exposing credential tokens in
successful auth JSON. Refresh returns the current opaque session, not JWT rotation. Successful
password change/recovery invalidate all account sessions atomically; client refresh
failure alone does not revoke them. Logout is idempotent and clears real provider
cookies. Cross-origin mutations require exact configured origins.
The API implements its side in [auth gateway](../../src/infrastructure/auth/gateway.ts)
and [HTTP routes](../../src/presentation/http/routes/auth.ts); frontend
adapters remain outside this checkout.
