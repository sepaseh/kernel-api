# Kernel API

Standalone TypeScript backend API for Kernel with authentication, role-based
access, multilingual responses, and local or MinIO object storage.

## Published scope

The current **localization-data** phase publishes pure feature contracts,
framework-free application services and feature ports, core authorization and
validation policies, and ten flat API message catalogs with their registry.

Application services cover account, authentication, calendar, files, roles,
settings and users. Their tests use synthetic ports. Catalog tests verify all ten
languages, vocabulary, placeholders, literal data and canonical object identity.
Runtime translation, configuration, logging, persistence, authentication adapters,
storage, HTTP and server composition belong to subsequent focused PRs.
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

The [canonical manifest](.agents/validation.json) defines the required checks,
including source boundaries, typechecking, lint, measured source and tooling
tests, and audit-helper tests. Fake-port and governance tests do not establish
unpublished adapter, database, HTTP, runtime or deployment behavior.
