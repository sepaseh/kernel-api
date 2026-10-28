# Backend boundaries

Read this rule before changing `src`. The backend uses a small application,
infrastructure and HTTP presentation split. Keep it lightweight: no DDD layer,
generic repository, CQRS framework, mediator or dependency-injection container.

## Ownership and dependency direction

- `application/<feature>.ts` owns use cases, business validation, authorization
  policy and operation ordering. Its models and feature-specific ports are plain
  TypeScript under `application/models.ts` and `application/ports`.
- Application code imports only application modules, framework-free
  `src/contracts` and appropriate native utilities. The only shared i18n
  exception is an erased type import/export from `src/application/localization.ts`;
  runtime catalogs are consumed only by infrastructure. Do not import Hono,
  Drizzle, Better Auth, Pino, configuration, DB schema or infrastructure types.
  Do not pass `Request`, `Response`, `Headers`, `FormData` or `File` into a use
  case; adapt them to plain values at the boundary.
- `infrastructure/persistence` implements the owning feature's ports with
  Drizzle. DB tables and migrations stay infrastructure-owned. Keep atomic
  writes in adapter transactions; application policies that depend on mutable
  state must run against the state read inside that transaction.
- `infrastructure/auth` adapts Better Auth and OTP delivery to application ports.
  `infrastructure/storage` implements the object-storage port. Config, logging,
  localization and process lifecycle also remain infrastructure-owned.
- `presentation/http` owns Hono routes, headers, cookies, multipart/JSON parsing,
  response serialization, HTTP status mapping and request logging. It calls
  application services rather than ORM/auth SDKs or persistence/storage adapters.
  Logging and localization are explicit transport crosscutting exceptions.
- The composition root manually creates concrete adapters and services. Only
  composition and isolated integration fixtures connect infrastructure to HTTP.
  Presentation-facing dependency types belong beside presentation, not in a
  module that constructs infrastructure.

## Extend a feature

For delete, status or relation changes, read [data lifecycle](data-lifecycle.md)
and enforce hard deletion only. When business references exist, return a localized
409 conflict with no partial writes; do not introduce soft deletion or bypass the
reference check through cascading deletion or silent unlinking. Owned technical
session, authentication-account and permission-row cleanup is defined separately
in that rule and runs only with an allowed hard delete.

Define its observable contract in `collection` and a feature-owned module under
`src/contracts`, then
add a focused application service and only the ports that service actually
needs. Implement those ports in infrastructure, wire them in composition and
keep the route limited to transport work. Do not add an `index.ts` barrel or an
adapter solely to rename an existing operation.

Use `ApplicationError` with a semantic failure kind and the local API message-key
type from `src/application/localization.ts`. HTTP maps
that kind to a status and localization maps the key to response text. Provider
failures remain ordinary errors; do not disguise infrastructure failures as bad
credentials or validation errors.
Add translated data under `src/infrastructure/localization/catalogs/<code>.ts`, never the
API's localization adapter. Follow the [localization rule](localization.md).

Preserve existing wire shapes, status codes, permission checks, session/cookie
behavior and global language policy during internal refactors. File operations
must retain public/private isolation, MIME/download/cache headers, compensating
object deletion and the original metadata failure when cleanup also fails.
Application callbacks can report plain upload stages/events; Pino formatting,
redaction and request identity remain outside application code. Authenticate
uploads before reading their body; keep the whole multipart stream bounded before
parsing and enforce the configured file limit on the parsed file as well.

## Validation and local state

`src/architecture.test.ts` inspects static, type-only and dynamic
imports to enforce the application/presentation boundaries, including global
HTTP types in application code. Run it after moving modules, and keep its narrow
transport exceptions explicit. Do not allow a forbidden dependency merely to
make the check pass.

Pure application tests use plain fake ports; HTTP/integration tests use
disposable SQLite and object storage. Run focused API tests, `npm run typecheck`
and the applicable contract checks for a completed change. Never point tests
at the owner's environment, `server/data`, real buckets or existing API process.
Source restructuring does not authorize moving runtime data, resetting users,
running production migrations or changing deployment configuration.

See [Architecture](../../docs/architecture.md),
[Feature development](../../docs/feature-development.md),
[Testing](../../docs/testing.md) and the [API guide](../../docs/api-runtime.md).
