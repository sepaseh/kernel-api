# Developing the API

[English](development.md) · [فارسی](development.fa.md)

Use the Node version in `.nvmrc` and install dependencies with `npm ci`. The API
is a standalone project; do not link runtime source from another checkout. Read
the current [README](../README.md) and [architecture](architecture.md) before
changing setup or composition. Preserve private environment files and existing
local data; tests use their own synthetic fixtures.

Use [source navigation](source-navigation.md) to locate the relevant layers,
[feature changes](feature-development.md) for behavioral changes, and
[validation](validation.md) before publication. The separate API consumers may
need coordinated rollout when an HTTP contract changes.

The local runtime and deployment templates do not prove production readiness;
production OTP delivery remains unimplemented. See [deployment](deployment.md)
for operator prerequisites and limits of the available checks.

## Dependency compatibility

Keep the Node.js runtime and `@types/node` on the same major. The current
`typescript-eslint` peer range supports TypeScript `>=4.8.4 <6.1.0`; check the
[upstream range](https://typescript-eslint.io/users/dependency-versions/) when
upgrading. Upgrade `better-auth`, `@better-auth/drizzle-adapter` and the
`@better-auth/core` override together, refresh the lockfile and run the full
validation profile. Do not use `--force` or `--legacy-peer-deps` to conceal an
incompatible dependency tree.
