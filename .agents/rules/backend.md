# Backend boundaries

Follow the [published scope](../README.md#published-scope).

Read this rule before changing `src`. The backend uses a small application,
infrastructure and HTTP presentation split. Keep it lightweight: no DDD layer,
generic repository, CQRS framework, mediator or dependency-injection container.

## Ownership and dependency direction

- `src/application/<feature>.ts` owns use cases, business validation, authorization
  policy and operation ordering. Its models and feature-specific ports are plain
  TypeScript in `src/application/models.ts` and `src/application/ports`.
- Application code imports only application modules, framework-free
  `src/contracts` and appropriate native utilities. Follow the
  [erased message type boundary](imports.md#erased-type-imports-and-exports).
  Do not import Hono, Drizzle, Better Auth, Pino, configuration, DB schema or
  infrastructure types.
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
- Feature-owned modules under `src/contracts` define HTTP wire shapes. The
  [import rules](imports.md#module-paths) keep those modules pure.

Read the owning source, manual wiring and
[executable boundary checks](imports.md#verify-boundaries) to establish runtime
ownership.

## Extend a feature

For delete, status or relation changes, follow the
[data lifecycle rules](data-lifecycle.md).

Follow the [HTTP contract workflow](api-collection.md#change-a-contract). Add a
focused application service and the ports it needs. Implement those ports in
infrastructure, wire them in composition and keep the route limited to
transport work. Avoid adapters whose sole purpose is renaming an operation.

Use `ApplicationError` with a semantic failure kind and the local API message-key
type from `src/application/localization.ts`. HTTP maps
that kind to a status and localization maps the key to response text. Provider
failures remain ordinary errors; do not disguise infrastructure failures as bad
credentials or validation errors.
Follow [message ownership](localization.md#message-ownership) when changing
translated data.

Preserve existing wire shapes, status codes, permission checks, session/cookie
behavior and global language policy during internal refactors.

## Uploads and file responses

Preserve public/private isolation and MIME, download and cache headers. Compensate by
deleting an uploaded object only when metadata persistence confirms that the
insert did not commit. Keep the object when the commit outcome is unknown.
Preserve the original metadata error and report any cleanup failure separately.
Application callbacks can report plain upload stages/events; Pino formatting,
redaction and request identity remain outside application code. Authenticate
uploads before reading their body; keep the whole multipart stream bounded before
parsing and enforce the configured file limit on the parsed file as well.

## Validation and local state

Use the [test selection rules](testing.md#choose-checks) for API, type and
contract checks. Follow the [fixture rules](testing.md#test-behavior-and-fixtures)
and [local-state rules](safety.md#secrets-and-local-state).
Source restructuring does not authorize moving runtime data, resetting users,
running production migrations or changing deployment configuration.

See [Architecture](../../docs/architecture.md),
[Feature development](../../docs/feature-development.md),
[HTTP transport](../../docs/http-transport.md) and [Testing](../../docs/testing.md).
