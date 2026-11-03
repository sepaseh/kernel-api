# Kernel API

Standalone TypeScript project for Kernel's backend API.

## Published scope

The current **database-persistence** phase publishes pure feature contracts,
framework-free application services and feature ports, core policies, ten flat
API catalogs, and infrastructure for configuration, translation, logging, fatal
process failures and local or S3-compatible MinIO object storage. It also includes
the libSQL/Drizzle schema, reviewed migrations, feature persistence,
authentication/OTP adapters, initialization and initial administrator provisioning.

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

HTTP routes and server composition belong to subsequent focused PRs.
`applicationReady` remains false; this scope establishes no running API,
production OTP delivery or deployed integration.

See the [documentation map](docs/README.md), [architecture](docs/architecture.md),
[contribution guide](CONTRIBUTING.md) and [security policy](SECURITY.md).

## Install and validate

Use the Node.js release in [.nvmrc](.nvmrc). Validate an isolated export of the
exact [publication inventory](.github/bootstrap-policy.json):

```sh
npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
npm run validate -- full
```

The [canonical manifest](.agents/validation.json) owns the required source-phase
checks. Local database and authentication tests cover the published adapters.
HTTP behavior, server operation, production OTP delivery and deployment
readiness require separate evidence.
