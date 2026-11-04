# Architecture and publication scope

The [inventory](../.github/bootstrap-policy.json) and
[validation manifest](../.agents/validation.json) declare the exact published
phase. `applicationReady` remains false.

The database-persistence phase includes pure feature contracts, core policies,
eight feature ports, seven framework-free application services and their
synthetic-port tests. All ten literal API catalogs, their registry and integrity
tests remain published, alongside the earlier governance controls and foundation.

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
HTTP routes and manual server composition belong to later publications.
Independent frontends communicate through HTTP.

The schema and reviewed migrations enforce business-reference restrictions.
Persistence owns transactions and derives full names from provided changes and
current database columns in one bound update. Deleting an entity in use raises
a semantic conflict without partial effects or automatic unlinking; only owned
technical identity rows may cascade. Soft deletion remains prohibited.
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

The storage protocol evidence is not a deployed MinIO integration. Local database
and authentication tests do not establish deployed services, HTTP adapters,
listener startup or server shutdown. Those HTTP/server owners and their fixture
tests remain unpublished. Production OTP delivery, deployed integrations and
production readiness stay outside this scope. See [logging](backend-logging.md)
and [object storage](object-storage.md) for the other infrastructure limits.

Read [backend](../.agents/rules/backend.md),
[data lifecycle](../.agents/rules/data-lifecycle.md),
[localization](../.agents/rules/localization.md) and
[validation](validation.md) for the owning constraints.
