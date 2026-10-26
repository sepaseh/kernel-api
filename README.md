# Kernel API

[English](README.md) · [فارسی](README.fa.md)

Kernel API is a standalone TypeScript project. The current **foundation** phase
provides pure HTTP contract definitions, application primitives and interfaces
for infrastructure adapters. `applicationReady` is **false**: this snapshot does
not provide a running HTTP API.

## Current scope

- [`src/contracts/`](src/contracts/) contains seven pure contract modules for
  account, authentication, locales, OTP, permissions, profile and settings.
- [`src/application/`](src/application/) contains seven framework-free core
  modules for authorization, errors, identity, localization vocabulary, models,
  permissions and validation.
- [`src/application/ports/`](src/application/ports/) contains eight adapter
  interfaces. They describe dependencies; concrete implementations are not
  included.
- Foundation and validation tests exercise the pure behavior. Repository checks
  also cover source boundaries, snapshot integrity, PR size, audit handling and
  the validation runner.

Feature services, HTTP routes, authentication execution, database access,
migrations, storage adapters and deployment are not included in this phase.
The toolchain has development dependencies and no runtime dependencies. Passing
foundation checks does not establish readiness of a complete API.

## Install and validate

Use the Node.js version in [`.nvmrc`](.nvmrc), within the range declared in
[`package.json`](package.json), and npm 12.

```sh
npm ci
npm run validate -- full
```

The [validation manifest](.agents/validation.json) owns all eight required checks
in the complete gate for the current phase. It checks the exact source snapshot,
dependency audit, source boundaries, types, lint, formatting, measured test
coverage and audit-helper tests.
These checks use local synthetic data and do not require an environment file,
existing database or running API.

The tests generate real `coverage/lcov.info` for the foundation and repository
tooling tested in this checkout. This is not coverage of HTTP, DB, authentication
or storage implementations. Generated coverage is not committed. See
[Sonar setup](docs/sonarqube.md) for the distinction between scanner execution
and the provider quality gate.

## Contribute

Read [Contributing](CONTRIBUTING.md) and the
[foundation phase guide](docs/bootstrap.md). Keep each PR at **100 or fewer
GitHub changed-file entries**; this is a limit on each PR's diff, not on the total
number of files allowed in the repository.

Use the existing native CI, CodeRabbit and Sonar integrations and
[branch protection](docs/branch-protection.md). Configuration alone does not
prove a hosted check ran. Record results for the exact proposed revision and
run the complete current-phase gate before an authorized commit or PR handoff.
