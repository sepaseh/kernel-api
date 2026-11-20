# Runtime sequences

This guide traces requests across the local server, HTTP adapters, application
services and persistence. See [architecture](architecture.md) for ownership.

## Login, refresh and logout

1. The HTTP adapter checks the origin, parses the login request and calls the
   auth service. The service checks application policy and uses Better Auth
   to verify credentials and create a session.
2. A successful login returns the opaque session token as `access_token`
   and sets the provider's HttpOnly session cookie. Clients can use a bearer
   token or a same-origin cookie proxy owned by the client application.
3. `POST /auth/refresh-token` returns the token for the authenticated session.
   It can restore an in-memory token through an existing session cookie.
4. Logout is idempotent and expires the provider's cookies, including HTTPS
   secure names. Password change and recovery update the credentials and revoke
   prior sessions in the same transaction.

See [authentication adapters](auth-adapters.md) and the
[login operation](../collection/auth/login/index.bru).

## Management writes

The HTTP adapter authenticates and authorizes the caller, then passes validated
transport input to the feature service. Operations that could remove the final
active system administrator recheck the administrator state within the write
transaction. Category and FAQ sorting compare the submitted IDs with the
current set and save positions in one transaction. An in-use category or file
returns 409 and keeps its references. See [database constraints](database-schema.md)
and [ordering](collection-guide.md#content-category-and-faq-ordering).

## Uploads

An authenticated upload checks visibility, permissions and file limits before
writing bytes. The service writes the object and then inserts the metadata. It
attempts compensation when persistence confirms that the insert failed before
commit, and preserves the bytes when the commit outcome is uncertain. A private
upload returns metadata without a public URL. Read
[object storage](object-storage.md) for upload contexts and deletion.

## Startup and shutdown

The API binds its HTTP listener, applies migrations, initializes settings and
prepares storage. Requests receive a bodyless 503 with `Cache-Control: no-store`
until the app is ready. An occupied port fails before database or storage
initialization. Shutdown closes owned resources within bounded deadlines.
See [local development](development.md) and [HTTP transport](http-transport.md).
