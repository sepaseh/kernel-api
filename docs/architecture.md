# Application architecture

[English](architecture.md) · [فارسی](architecture.fa.md)

The current [http-transport phase](bootstrap.md) contains a framework-free
application layer, local contracts, feature ports, ten static API catalogs and
configuration, translation, logging, fatal-lifecycle support and real database
schema, migrations, authentication/OTP persistence, administrator provisioning
and Hono HTTP route adapters.
`applicationReady:false` is deliberate: there is no HTTP server, application composition
root or production OTP delivery in this snapshot. See [authentication adapters](auth-adapters.md).
Local and S3-compatible MinIO adapters implement the object-storage port; their
factory is not an application composition root.

## Database and persistence

`infrastructure/db/schema.ts` defines the SQLite schema; reviewed SQL and snapshot
metadata live in `drizzle/`. The database factory owns libSQL connection creation
and Drizzle binding. Only the exact owned database/persistence modules may import
their SDKs; application ports expose domain values rather than ORM types.

Account, calendar, file-metadata, identity, role, settings and user adapters
implement the existing ports. Role replacement and user administrative writes
are transactional. Profile name updates derive untouched name components from current
database columns in the same bound SQL update, preserving consistency across
partial patches from stale actor snapshots. Assigned roles, users with business references and referenced
logo files cannot be deleted; allowed identity deletion cascades only to owned
technical sessions/accounts. No soft-delete flag or automatic business unlinking
is introduced. Settings preserve language when a branding-only write omits it.
Constraint classification walks error causes safely, including cycles, and
unrelated failures retain their original identity.

Real libSQL/Drizzle tests use in-memory or fresh owned file databases. They apply
fresh and populated-upgrade migrations, compare columns/foreign keys/indexes with
the ORM and snapshot metadata, verify rollback and reference restrictions, and
close/remove their fixtures. These tests establish the published SQLite adapter
behavior, not production migration execution, remote database behavior, HTTP
authorization or complete authentication. Read [database schema](database-schema.md).

## Local object storage

`src/infrastructure/storage/local.ts` implements the existing object-storage port
with Node's filesystem. Public and private objects use separate fixed buckets;
`put` creates missing directories and uses exclusive creation (`wx`), so a repeated
key fails without replacing the original bytes. Reads and deletes propagate a
missing-object failure. Keys must resolve below their bucket; Windows absolute
paths and backslash-shaped keys are rejected on every host.

After exclusive creation, a write or close failure triggers a best-effort close
and removal of only that call's new target. An `EEXIST` failure never removes an
existing object. Cleanup failures cannot replace the original operation error;
if removal itself fails, the partial object remains for operator cleanup.

This is lexical containment, not a sandbox against a host user who can alter the
storage directory or insert symlinks. The configured directory must be controlled
by the API process. Object keys and visibility come from the application service;
the local adapter's public URL targets the API content route and does not
publish the storage directory. The HTTP adapter delegates content access to the
application service, which authorizes against file metadata.

`storage/operations.ts` wraps an operation with fixed diagnostic metadata, without
raw exception details or object paths. It preserves the original failure even if
the logging destination throws. The local adapter's reviewed write/cleanup
behavior is independent of the MinIO adapter. No memory test adapter or HTTP
composition is published in this phase.

Tests use real writes, reads and hard deletes in a fresh owned temporary directory,
verify public/private separation, exclusive creation, empty/binary objects,
invalid buckets and escaping/absolute keys, and remove their fixtures after each
test. Fault injection writes real partial bytes and verifies cleanup, retry,
preservation of existing objects and original-error identity when close or removal
fails. Actual Pino output proves safe metadata; these tests do not prove external
object storage, HTTP authorization or host-filesystem isolation.

## S3-compatible object storage

`storage/minio.ts` implements the same port with `@aws-sdk/client-s3`;
`storage/create.ts` selects it only for the explicit `minio` driver. SDK types
remain inside infrastructure. The adapter owns `<base>-private` and `<base>-public`
bucket names derived from the configured `MINIO_BUCKET` base,
requires explicit credentials, endpoint and signing region (optional `MINIO_REGION`
defaults to `us-east-1`), enforces TLS outside localhost or literal loopback,
removes the private bucket's policy and grants public reads only on the public
bucket. Conditional creation prevents replacing an existing object. Redirects are
not followed; configured custom regions do not rely on AWS profile defaults.

Unversioned buckets are required at readiness and before writes/deletes. A
versioning status, including suspended versioning, fails closed; the adapter
does not change bucket versioning or create soft-delete markers. Configuration
must remain under operator control: checking then deleting is not atomic against
a concurrent privileged bucket-policy/versioning change. Read [object storage](object-storage.md)
for URL rules, namespace assumptions and exact behavior.

Tests use the real SDK against a disposable loopback HTTP server with synthetic
credentials, independently verified signatures, isolated empty profile files and
external network blocked. This covers S3 request/response behavior and failures;
it does not prove compatibility with a deployed MinIO release, service identity
policy or operational TLS configuration.

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

Several administrative services expect authorization at the HTTP
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
the HTTP adapter uses the API-owned active-language setting. Engine tests
establish translation execution; catalog-data tests establish data integrity.
Persisted-language reads and branding-only writes are tested against the database;
HTTP localization is tested with synthetic fixtures; deployed session-language integration remains unvalidated.

Soft deletion is prohibited. Role deletion uses the port's atomic
`deleteIfUnassigned` result and reports a semantic conflict when assigned. User
deletion re-reads state through its transaction port, protects self/final active
administrator and reports a conflict for a record still in business use.
Dependents must be resolved first; do not silently unlink them or cascade away
business records. HTTP mapping returns a localized 409 for conflicts.
The published persistence adapters and foreign keys enforce reference checks,
allowed technical cleanup and writes atomically. Populated-upgrade and rollback
tests verify these database invariants; synthetic HTTP tests verify conflict mapping.

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

Before runnable publication, compose the concrete HTTP/auth adapters around the published
database and storage adapters, and validate the actual entry point with full HTTP
contract, permission, session/cookie, translation, transaction/concurrency, OTP
and storage integration tests using fresh disposable fixtures. The HTTP adapter counts actual request bytes before multipart parsing, with a bounded 64 KiB framing allowance; the application separately checks file bytes. Network adapter behavior still needs runnable-phase tests.

The [canonical full gate](../.agents/validation.json) validates only the published
scope and produces actual coverage from this checkout. Preserve that evidence's
limits and the [current-head Sonar/CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit)
when publishing each focused PR.
