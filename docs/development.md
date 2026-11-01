# API development

Use the Node version in `.nvmrc` and install dependencies with `npm ci`. The API
is a standalone project; do not link runtime source from another checkout. Read
the current [README](../README.md) and [architecture](architecture.md) before
changing setup or composition. Preserve private environment files and existing
local data; tests use their own synthetic fixtures.

Use [source navigation](source-navigation.md) to locate the relevant layers,
[feature changes](feature-development.md) for behavioral changes, and
[validation](validation.md) before publication. The separate API consumers may
need coordinated rollout when an HTTP contract changes.

The current http-composition phase includes Hono adapters, manual composition
and a local Node server. Local execution establishes neither production OTP
delivery nor deployment readiness. Deployment templates and the planned
`docs/deployment.md` guide belong to a later publication.

## Local execution

The root `.env.example` is a synthetic configuration template. `npm run dev`
does not load it automatically; supply the required environment explicitly. Keep
real credentials and private environment files outside Git. The example's
suggested `.env.local` filename does not make it an automatically loaded file.

After installing the locked dependencies, supply configuration in the launching
process environment and use `npm run dev` or `npm start`. Both run the local Node
entry point. Select an intended local database and storage directory; use fresh
owned disposable paths for tests. The server binds before opening the database
or initializing storage, returns non-cacheable 503 responses until ready, then
serves the composed application. An occupied port fails before those resources
are initialized. See [HTTP transport](http-transport.md).

Local OTP flows require an explicitly configured development/test code. A fixed
code is rejected in production, and no production delivery provider is supplied.

## Database initialization and administrator provisioning

Startup applies the reviewed migrations and initializes settings for the
configured database. Source publication does not authorize changing existing
runtime data. Obtain explicit authorization and a verified matching backup
before migrating an existing database; do not use another checkout's data.

`npm run server:bootstrap` reads initial administrator JSON from standard input.
It refuses a database with existing users and creates the user and credential
atomically without starting a session. It uses explicit configuration and does
not load private environment files. See [authentication adapters](auth-adapters.md)
and [database schema](database-schema.md).

Development seeding is opt-in and must use one instance. It refuses a nonempty
business database without the complete expected sample administrator and fails
explicitly on an incomplete earlier seed. The emptiness check and sample
business records share a transaction; migrations and initial settings happen
separately before it.

Repository Drizzle generation tooling and separate generation/migration commands
are deferred to a later tooling publication. This phase's startup initializer
applies the already reviewed SQL; it does not generate migrations.

## Dependency compatibility

Keep the runtime pinned by `.nvmrc` and `@types/node` on the same major. Respect
the installed TypeScript/ESLint peer ranges and upgrade `better-auth`,
`@better-auth/drizzle-adapter` and the `@better-auth/core` override together.
Refresh the lockfile and run the full validation profile after dependency
changes. Do not use `--force` or `--legacy-peer-deps` to hide an incompatible tree.

When migration and unused-code tooling is published, validate its actual
configuration and scoped compatibility overrides against the reviewed lockfile.
Drizzle generation and Knip are not current commands or evidence of validation
in this phase.
