# Kernel API

Standalone TypeScript backend API for Kernel with authentication, role-based
access, multilingual responses, and local or MinIO object storage.

## First publication

This PR establishes repository rules, assistant guidance, GitHub protection
configuration, CodeRabbit review policy and SonarQube Cloud analysis.
The small published scripts validate and enforce those rules. API source and
deployment assets are reserved for subsequent focused PRs.

This governance scope establishes no application or production readiness.
See the [documentation map](docs/README.md), [contribution guide](CONTRIBUTING.md)
and [security policy](SECURITY.md).

## Validate the proposed publication

Use the Node.js release in [.nvmrc](.nvmrc). From an isolated export containing
only the [publication inventory](.github/bootstrap-policy.json), run:

```sh
npm ci --strict-peer-deps --no-audit --no-fund
npm run validate -- full
```

The current [manifest](.agents/validation.json) validates governance only.
Application PRs must establish their own complete source and behavior gate;
governance tests do not establish API, authentication, database or storage behavior.
