# Kernel API

[English](README.md) · [فارسی](README.fa.md)

Kernel API is a standalone TypeScript project. The current
**database-persistence** phase provides contracts, application services,
feature ports, ten API catalogs, configuration, translation and logging support,
local filesystem plus S3-compatible MinIO object storage, and real libSQL/Drizzle
database schema, migrations and non-authentication persistence.
`applicationReady` remains **false**: this
snapshot does not start an HTTP API.

## Current scope

- [`src/contracts/`](src/contracts/) contains seven pure contract modules for
  account, authentication, locales, OTP, permissions, profile and settings.
- [`src/application/`](src/application/) contains seven core modules for
  authorization, errors, identity, localization vocabulary, models, permissions
  and validation, plus services for account, authentication, calendar, files,
  roles, settings and users.
- [`src/application/ports/`](src/application/ports/) contains eight feature ports
  for persistence, authentication, OTP and object storage. Concrete adapters for
  non-authentication persistence and local/MinIO storage are published; concrete
  authentication and OTP persistence remain outside this phase.
- [`src/infrastructure/localization/catalogs/`](src/infrastructure/localization/catalogs/)
  contains flat, complete API catalogs for Arabic, German, English, Spanish,
  Persian, French, Italian, Portuguese, Russian and Turkish. Its `index.ts`
  exposes each original catalog object. The separate
  [`i18n.ts`](src/infrastructure/localization/i18n.ts) adapter uses i18next for
  language resolution and interpolation.
- [`src/infrastructure/config.ts`](src/infrastructure/config.ts) validates
  synthetic or supplied environment settings without loading environment files.
  [`logging/`](src/infrastructure/logging/) provides structured Pino logs and
  redaction; [`lifecycle.ts`](src/infrastructure/lifecycle.ts) handles fatal
  process failures with a bounded flush and exit.
- Pure tests cover application policies and operation ordering with synthetic
  fake ports, plus catalog vocabulary, placeholders and static-data boundaries.
  Support tests use real i18next/Pino and isolated subprocesses for fatal failures.
  Governance tests cover source boundaries, exact publication scope,
  PR size, audit handling and validation execution.
- [`src/infrastructure/storage/local.ts`](src/infrastructure/storage/local.ts)
  stores exact bytes in separate local public/private buckets, creates objects
  exclusively and exposes public API content URLs. The
  [`operations.ts`](src/infrastructure/storage/operations.ts) wrapper logs safe
  failure metadata while preserving the original storage error. Filesystem tests
  use fresh temporary directories and remove their own fixtures after every test.
- [`storage/minio.ts`](src/infrastructure/storage/minio.ts) uses the AWS S3 SDK
  with explicit credentials and endpoint, separate owned buckets, conditional
  creation and refusal of versioned buckets. [`create.ts`](src/infrastructure/storage/create.ts)
  selects the configured adapter; [`url.ts`](src/infrastructure/storage/url.ts)
  validates and encodes public object references. See [object storage](docs/object-storage.md)
  for setup assumptions and the limits of signed loopback protocol tests.

- [`db/`](src/infrastructure/db/) and [`persistence/`](src/infrastructure/persistence/)
  implement the reviewed schema and account, calendar, file-metadata, identity,
  role, settings and user persistence. [Migrations](drizzle/) preserve existing
  records and enforce business-reference restrictions. Real libSQL/Drizzle tests
  verify rollback, hard deletion, conflicts and persisted language/branding.
  See [database schema](docs/database-schema.md).

[Architecture](docs/architecture.md) explains ownership, language authority,
hard-deletion policy and what fake-port tests can establish. HTTP routes,
cookies, concrete authentication/OTP, database initialization/seeding, application composition and
deployment are not published or validated in this phase. Runtime dependencies are
i18next, Pino, `@aws-sdk/client-s3`, `@libsql/client` and `drizzle-orm`; pino-pretty is a development dependency for readable local logs.

## Install and validate

Use the Node.js version in [`.nvmrc`](.nvmrc), within the range declared in
[`package.json`](package.json), and the npm bundled with that Node release.
CI uses the same pinned Node release without upgrading npm separately.

```sh
npm ci
npm run validate -- full
```

The [validation manifest](.agents/validation.json) owns all nine required checks
in the complete current-phase gate: exact source snapshot, semantic CI policy, dependency audit,
source boundaries, types, lint, formatting, measured test coverage and audit-helper
tests. These checks use synthetic data and do not need an environment file,
existing database or running API.

Tests generate real `coverage/lcov.info` for published application source, catalog data, infrastructure support and
repository tooling in this checkout. Real database tests measure the published
persistence adapters and migration behavior. This is not coverage of concrete HTTP,
authentication or a deployed MinIO service. It includes real filesystem storage
and signed S3 SDK tests against a synthetic loopback HTTP server.
Generated coverage is not committed.
See [Sonar setup](docs/sonarqube.md) for scanner and provider-gate evidence.

## Contribute

Read [Contributing](CONTRIBUTING.md) and the
[publication phase guide](docs/bootstrap.md). Keep each PR at **100 or fewer
GitHub changed-file entries**; this limits each PR's diff, not the repository's
file count.

Use native CI, CodeRabbit and Sonar integrations and
[branch protection](docs/branch-protection.md). Record actual results for the
exact proposed revision and run the full phase gate before an authorized commit
or PR handoff. Before requesting CodeRabbit, complete the
[current-head, zero-open-issue preflight](docs/sonarqube.md#before-requesting-coderabbit).
