# Architecture and publication scope

The [inventory](../.github/bootstrap-policy.json) and
[validation manifest](../.agents/validation.json) declare the exact published
phase. `applicationReady` remains false.

The runtime-operations phase includes pure feature contracts, core policies,
eight feature ports, seven framework-free application services and their
synthetic-port tests. All ten literal API catalogs, their registry and integrity
tests remain published, alongside the earlier governance controls and foundation.
Hono routes, manual composition and a Node listener now connect the services to
the concrete database, authentication and storage adapters for local execution.

Concrete infrastructure provides configuration parsing, real i18next
translation, Pino logging and sanitization, fatal process handlers, local
filesystem and S3-compatible MinIO storage, driver selection and URL validation.
These dependencies stay in their infrastructure owners; application services
remain framework free. `pino-pretty` is a development dependency used only for
development output.

Contracts have no catch-all barrel. Locale metadata, permissions, OTP concepts
and profile bounds retain one local definition. Application vocabulary imports
are erased types; application services never load catalogs or a translation
engine. Catalogs contain literal nonempty strings, not executable fallbacks.
The narrowly named Sonar duplication exception covers only their ten data files;
the registry and locale metadata retain duplication analysis, and all source,
rules and measured coverage remain analyzed.

Configuration consumes a supplied environment object or `process.env` without
loading environment files. Invalid drivers and numeric settings fail; selecting
MinIO requires explicit credentials and endpoint settings. The public
`.env.example` is synthetic configuration evidence, not a running environment.

The API owns database access, migrations, authentication and storage. Services
depend on feature ports; concrete infrastructure implements storage, feature
persistence, Better Auth and OTP persistence. Database SDKs and their types stay
in the reviewed infrastructure owners, never in application ports. Thin Hono
routes adapt input, authorization, errors and HTTP responses; they do not own
database queries or application policy. `src/composition.ts` and
`src/dependencies.ts` wire the reviewed owners manually, and `src/index.ts`
starts the local server. Independent frontends communicate through HTTP.

The schema and reviewed migrations enforce business-reference restrictions.
Persistence owns transactions and derives full names from provided changes and
current database columns in one bound update. Deleting an entity in use raises
a semantic conflict without partial effects or automatic unlinking; HTTP maps it
to a localized 409 response. Only owned technical identity rows may cascade.
Soft deletion remains prohibited.
Initialization, optional development seeding and initial administrator
provisioning are included. Production OTP delivery is not implemented.

Fake-port tests establish application policy and operation ordering. Engine tests
exercise every catalog through real resolution and interpolation. Logging tests
use real Pino; isolated subprocesses establish fatal logging, flushing and exit
behavior. Filesystem tests verify exact bytes, exclusive creation, hard deletion
and path rejection using owned disposable directories. Storage SDK tests verify
signed requests against an owned loopback HTTP fixture with synthetic credentials,
isolated empty AWS profiles and external-network protection.

Real libSQL/Drizzle tests use owned temporary or in-memory databases to verify
fresh and populated-upgrade migrations, schema/metadata parity, foreign keys,
transaction rollback, reference conflicts and preserved language/settings.
Authentication tests exercise real adapters with synthetic identities and
credentials, OTP records and administrator provisioning. See
[database schema](database-schema.md) and [authentication adapters](auth-adapters.md).

HTTP suites exercise the Hono adapters with synthetic services and real disposable
databases. The listener binds before database or storage initialization and
returns bodyless, non-cacheable 503 responses until the composed app is ready.
An occupied port fails before those resources initialize. Local runtime suites
cover readiness, startup failure, cleanup and shutdown, using real Unix signals
or the Windows signal-message simulation in their respective environments.

Operational owners provide exclusive immutable release packaging, validated
Docker/native references, health/configuration checks, migration tooling and
manual verification/release workflows. Real toolchain tests generate and migrate
only owned scratch schemas/databases. Static/template, parser, loopback and
cleanup tests exercise the published tooling. Recovery workers restore matched
synthetic database/object fixtures and verify authenticated HTTP behavior and
redacted incident correlation.

The storage protocol evidence is not a deployed MinIO integration. Local HTTP,
server and recovery tests do not establish deployed services, production OTP
delivery or production readiness. Native/Docker smoke commands are separate
opt-in execution, not part of the full validation profile. Checked-in templates
and workflows do not prove their operator setup or remote execution. See
[deployment](deployment.md), [backup/recovery](backup-restore.md), [HTTP transport](http-transport.md),
[development](development.md), [logging](backend-logging.md) and
[object storage](object-storage.md) for execution and evidence limits.

Read [backend](../.agents/rules/backend.md),
[data lifecycle](../.agents/rules/data-lifecycle.md),
[localization](../.agents/rules/localization.md) and
[validation](validation.md) for the owning constraints.
