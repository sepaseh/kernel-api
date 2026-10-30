# API development

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

## Database migration tooling

`npm run server:generate` generates migrations from the schema without requiring
`DATABASE_URL`. `npm run server:migrate` applies migrations and requires an
explicit `DATABASE_URL`; select only a database you are authorized to change.
Keep real credentials and private environment files outside Git.

## Dependency compatibility

Review and validate Drizzle Kit and its scoped esbuild override when changing
the toolchain or its dependencies. Knip treats `drizzle.config.ts` and the schema
as static entry points; its Drizzle plugin is disabled, so a passing Knip check
does not validate plugin-specific dependency discovery.

Keep the Node.js 24 runtime and `@types/node` on the same major. TypeScript stays
on a supported 6.0 patch while the installed `typescript-eslint` supports
`>=4.8.4 <6.1.0`; do not force TypeScript 7 past that peer constraint. Check the
[upstream support range](https://typescript-eslint.io/users/dependency-versions/)
before changing this limit.

Upgrade `better-auth`, `@better-auth/drizzle-adapter` and the `@better-auth/core`
override together. Preserve the scoped esbuild override for Drizzle Kit's legacy
loader, subject to toolchain compatibility and security review; do not override
every esbuild consumer. Use stable
releases, refresh the lockfile and run the full validation profile after dependency
upgrades. Do not use `--force` or `--legacy-peer-deps` to hide an incompatible tree.
