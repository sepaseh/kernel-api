# Application architecture

[English](architecture.md) · [فارسی](architecture.fa.md)

The current [storage-local phase](bootstrap.md) contains a framework-free
application layer, local contracts, feature ports, ten static API catalogs and
configuration, translation, logging and fatal-lifecycle support.
`applicationReady:false` is deliberate: there is no HTTP server, composition
root, database schema, migration, authentication provider or MinIO adapter in this snapshot.

## Local object storage

`src/infrastructure/storage/local.ts` implements the existing object-storage port
with Node's filesystem. Public and private objects use separate fixed buckets;
`put` creates missing directories and uses exclusive creation (`wx`), so a repeated
key fails without replacing the original bytes. Reads and deletes propagate a
missing-object failure. Keys must resolve below their bucket; Windows absolute
paths and backslash-shaped keys are rejected on every host.

This is lexical containment, not a sandbox against a host user who can alter the
storage directory or insert symlinks. The configured directory must be controlled
by the API process. Object keys and visibility come from the application service;
the local adapter's public URL targets the future API content route and does not
publish the storage directory. The future HTTP route must authorize content reads
against file metadata. Returning a URL is not evidence that this route exists.

`storage/operations.ts` wraps an operation with fixed diagnostic metadata, without
raw exception details or object paths. It preserves the original failure even if
the logging destination throws. There is no storage factory, MinIO SDK, memory
test adapter or HTTP composition in this phase.

Tests use real writes, reads and hard deletes in a fresh owned temporary directory,
verify public/private separation, exclusive creation, empty/binary objects,
invalid buckets and escaping/absolute keys, and remove their fixtures after each
test. Actual Pino output proves safe metadata; these tests do not prove external
object storage, HTTP authorization or host-filesystem isolation.

## Ownership and dependencies

`src/contracts` owns pure wire definitions and constants. Application services
under `src/application` consume those definitions, core validation/errors/models
and the ports under `src/application/ports`. Imports stay within this checkout;
there is no workspace or shared-package dependency.

Application services never import framework, ORM, authentication/storage SDK or
HTTP request/response types. The localization module supplies erased message-key
types. Static translated strings live in
`src/infrastructure/localization/catalogs/`; the separate `localization/i18n.ts`
adapter owns translation execution through i18next. HTTP status mapping belongs
to the future transport. Each language module exports one flat literal
object and may import the application vocabulary only as a fully erased type.
The registry in `catalogs/index.ts` consumes those original objects and the
erased locale contract type. Application code cannot import catalog data or
other infrastructure.
`scripts/check-boundaries.mjs` checks source containment, local dependency
resolution, contract purity and forbidden application dependencies. The exact
publication guard separately rejects undeclared source and runnable layers.
Catalog AST checks reject executable logic, engine imports and fallback spreads;
the only catalog runtime dependencies are the registry's local data imports.

`src/infrastructure/config.ts` parses supplied environment settings without loading
environment files or opening services. It validates numeric settings and driver
selection and requires explicit credentials for MinIO.
Fixed OTP codes and development seeding require an explicit `NODE_ENV` of
`development` or `test`; an unset or other environment rejects fixed codes and
keeps seeding disabled. This does not change logging's development default.
`logging/logger.ts` owns
Pino JSON logging and asynchronous request context; `logging/sanitization.ts`
removes private fields and raw error/SDK details, including credential assignments
inside serialized JSON text. Development pretty output uses
pino-pretty with the same redaction policy. `lifecycle.ts` installs fatal-error
handlers only when called and keeps them active while flushing, so repeated fatal
failures cannot fall through to raw process diagnostics. Flushing is bounded
before process exit. None of these
support modules composes or starts an HTTP server.

| Service       | Responsibility                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account.ts`  | Account serialization, profile/username validation and email-verification ordering through account/OTP ports.                                                                     |
| `auth.ts`     | Session-to-actor checks, credential/OTP use cases and password-change ordering. Explicit provider rejections become semantic validation errors; outages remain ordinary failures. |
| `calendar.ts` | Calendar-date validation and repository operations.                                                                                                                               |
| `files.ts`    | Upload validation, public-upload permission, object/metadata sequencing, public-read isolation and compensating object cleanup.                                                   |
| `roles.ts`    | Role validation, permission deduplication and assigned-role deletion conflicts.                                                                                                   |
| `settings.ts` | Public branding/language serialization, settings-update authorization and system-administrator language authority.                                                                |
| `users.ts`    | User validation/pagination, role assignment, credential/status operations and self/final-administrator deletion protection.                                                       |

Several administrative services expect authorization at the future HTTP
boundary rather than accepting an actor for every method. A service method's
presence does not make an endpoint or establish transport authorization. The
future composition root must inject concrete adapters and the transport must
perform the required authentication/permission checks.

## Language and deletion policies

The supported-language metadata in `src/contracts/locales.ts` owns codes,
direction, calendar and public names. Settings expose that metadata with the
persisted active language. Only a system administrator can change the active
language; ordinary permitted branding saves do not overwrite a concurrent
language change. Frontends consume API settings rather than persisting an
independent user language choice.

All ten catalog files have the complete application message vocabulary and
matching interpolation variables. Values are genuine translations, with one
flat key space per language. The registry preserves canonical object identity
without copying data or choosing a fallback. The separate engine resolves supported
codes and interpolates messages from every catalog, with English fallback for
unsupported codes. That fallback does not authorize a separate user language choice:
the future HTTP adapter must use the API-owned active-language setting. Engine tests
establish translation execution; catalog-data tests establish data integrity.
HTTP response localization and persisted-language selection remain unvalidated.

Soft deletion is prohibited. Role deletion uses the port's atomic
`deleteIfUnassigned` result and reports a semantic conflict when assigned. User
deletion re-reads state through its transaction port, protects self/final active
administrator and reports a conflict for a record still in business use.
Dependents must be resolved first; do not silently unlink them or cascade away
business records. Future HTTP mapping must return a localized 409 for conflicts.
Future persistence adapters must enforce reference checks, allowed technical
cleanup and writes atomically. These requirements are not proof of a database
implementation in this phase.

## Test evidence and remaining integration

Pure application tests inject small synthetic fake ports. They exercise policy,
semantic errors, dependency calls and observable ordering. File tests cover
compensating cleanup and preservation of the original metadata failure even if
cleanup also fails. User tests verify transaction-port policy against the state
read inside the callback; they do not prove database isolation or rollback.
Data-only catalog tests cover language and message-key parity, flat strings,
interpolation variables and canonical object identity without loading a translation
engine.
Separate engine tests load real i18next for all ten languages. Configuration tests
use synthetic environment objects. Logging tests exercise real Pino output,
redaction, safe causes/query-shaped errors, request-context isolation and pretty
printing. Fatal-handler tests run in isolated subprocesses and check bounded
flush/exit behavior without installing handlers in the test runner. Server startup
failure handling is deferred until the HTTP entry point is published.

Uploads reject oversized declared sizes before reading, then validate the actual
read bytes before any object write. Metadata and upload diagnostics use the
actual byte length. File event callbacks are best-effort synchronous diagnostics:
their exceptions cannot fail a committed upload, prevent cleanup or replace the
original storage/metadata error.

Before runnable publication, add concrete HTTP/auth/persistence/storage adapters,
manual composition and full HTTP contract, permission, session/cookie,
translation, transaction/concurrency, OTP and storage integration tests using
fresh disposable fixtures. The file-size check occurs after the boundary has
provided an upload source; it is not a bounded pre-parse HTTP stream guarantee.

The [canonical full gate](../.agents/validation.json) validates only the published
scope and produces actual coverage from this checkout. Preserve that evidence's
limits and the [current-head Sonar/CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit)
when publishing each focused PR.
