# Kernel API

Kernel API is a standalone TypeScript project. Its current **foundation** phase
publishes pure contracts and core application modules with tests and repository
validation tooling.

## Published scope

The fifteen source files contain language, OTP, permission and profile
contracts; authorization, semantic errors, identity, localization vocabulary,
models, permission definitions and string validation; authentication port
definitions; and two foundation test suites. These modules remain independent
of HTTP, database, authentication and storage frameworks.

The previous governance publication established repository rules, assistant
guidance, review configuration and their enforcing tools. Those controls remain
part of the foundation publication. Application services, runtime catalogs,
adapters, migrations, HTTP routes and a server belong to later focused PRs.
`applicationReady` remains false. This phase establishes no running API or
production readiness.
See the [documentation map](docs/README.md), [contribution guide](CONTRIBUTING.md)
and [security policy](SECURITY.md).

## Validate the proposed publication

Use the Node.js release in [.nvmrc](.nvmrc). From an isolated export containing
only the [publication inventory](.github/bootstrap-policy.json), run:

```sh
npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
npm run validate -- full
```

The current [manifest](.agents/validation.json) runs every required check,
including source boundaries, typechecking, lint, measured foundation and tooling
tests, and audit-helper tests. These results cover the published snapshot;
they do not establish HTTP, authentication, database or storage behavior.
