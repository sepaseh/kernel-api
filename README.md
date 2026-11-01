# Kernel API

Standalone TypeScript project for Kernel's backend API.

## Published scope

The current **collection-management** phase publishes pure feature contracts,
framework-free application services and feature ports, core policies, ten flat
API catalogs, and infrastructure for configuration, translation, logging, fatal
process failures and local or S3-compatible MinIO object storage. It also includes
the libSQL/Drizzle schema, reviewed migrations, feature persistence,
authentication/OTP adapters, initialization and initial administrator provisioning.
Thin Hono routes, manual composition and a local Node listener connect these
owners into a runnable local API.

Application services cover account, authentication, calendar, files, roles,
settings and users. Their tests use synthetic ports. Catalog tests preserve
vocabulary, placeholders, literal data and canonical identity. Real i18next tests
exercise resolution and interpolation for all ten languages. Pino and isolated
subprocess tests cover structured redaction and fatal logging/flush/exit behavior.

Configuration parses an explicit environment object or `process.env` without
loading private files. The published `.env.example` contains synthetic values.
Local-storage tests use fresh owned temporary directories. MinIO tests use the
real signed S3 SDK against an owned loopback HTTP fixture with synthetic
credentials and isolated host-profile state. They establish protocol behavior,
not a deployed MinIO integration. See [logging](docs/backend-logging.md) and
[object storage](docs/object-storage.md).

Real tests use owned temporary or in-memory databases to verify fresh and
populated-upgrade migrations, schema/metadata parity, foreign keys, atomic
rollback, reference conflicts and preserved system language. Synthetic Better
Auth tests exercise stored identities, credentials, OTP persistence and
administrator provisioning. See [database schema](docs/database-schema.md) and
[authentication adapters](docs/auth-adapters.md).

HTTP tests exercise authorization, origin and input checks, localized errors,
uploads and request logging with synthetic services and real disposable database
fixtures. Local runtime tests cover startup, cleanup and shutdown, non-cacheable
503 responses before readiness, and occupied-port failure before database or
storage initialization. See [HTTP transport](docs/http-transport.md) and
[development](docs/development.md) for explicit local configuration and execution.

Operational tooling adds owned release packaging, Docker/native deployment
references, configuration/health checks and Drizzle generation compatibility
tests. Synthetic recovery drills exercise matched database/object recovery and
HTTP/log correlation. CodeQL configuration and manual release, staging, smoke
and DAST workflows require separate provider/operator setup. See
[deployment](docs/deployment.md), [release operations](docs/release-operations.md)
and [backup/recovery](docs/backup-restore.md).

`applicationReady` remains false. A runnable local API does not establish
production OTP delivery, deployment readiness or a deployed integration.

See the [documentation map](docs/README.md), [architecture](docs/architecture.md),
[contribution guide](CONTRIBUTING.md) and [security policy](SECURITY.md).

## Install and validate

Use the Node.js release in [.nvmrc](.nvmrc). Validate an isolated export of the
exact [publication inventory](.github/bootstrap-policy.json):

```sh
npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
npm run validate -- full
```

The [canonical manifest](.agents/validation.json) owns all ten real source-phase
checks, including the published HTTP and local runtime suites. Their disposable
fixtures do not establish a deployed database or MinIO service, production OTP
delivery or deployment readiness. Native and Docker smoke commands are opt-in;
the full profile does not execute them or prove their success.

The published Bruno groups cover account, authentication, calendar, languages,
roles and settings. Their saved examples and feature suites are declared in the
inventory. User and file requests follow separately; their HTTP routes already exist.
