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

The current runtime-operations phase includes Hono adapters, manual composition
and a local Node server. Local execution establishes neither production OTP
delivery nor deployment readiness. Owned packaging, deployment references and
manual checks are described in [deployment](deployment.md); their presence is
not evidence of an activated service.

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

`npm run test:fixture:website` starts a disposable test API on
`http://127.0.0.1:3100` by default. For concurrent runs or a port conflict, set
`WEBSITE_TEST_API_PORT` to a distinct available port and configure the website test
client to use that same API origin. The allowed website origin remains
`http://127.0.0.1:3101`.

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

`npm run server:generate` generates migration changes from the schema without
requiring database credentials. `npm run server:migrate` applies reviewed
migrations using an explicit `DATABASE_URL`; select only an owned fixture or a
database you are authorized to change. The startup initializer applies reviewed
SQL and does not generate migrations. Toolchain tests copy the configuration
into owned fixtures and exercise the real CLI independently of private state.

## Dependency compatibility

Keep the runtime pinned by `.nvmrc` and `@types/node` on the same major. Respect
the installed TypeScript/ESLint peer ranges and upgrade `better-auth`,
`@better-auth/drizzle-adapter` and the `@better-auth/core` override together.
Refresh the lockfile and run the full validation profile after dependency
changes. Do not use `--force` or `--legacy-peer-deps` to hide an incompatible tree.

Drizzle Kit's legacy loader uses the reviewed scoped esbuild override `0.28.2`.
Keep that compatibility choice aligned with the lockfile and real toolchain
tests; do not broaden it to unrelated esbuild consumers. Additional unused-code
tooling remains outside this phase.

Release packaging and rendering use `deploy:package` and `deploy:render`.
Configuration and semantic health checks use `deploy:check` and `deploy:health`;
see the deployment guide for authorized targets and protected inputs. The full
profile includes synthetic operational/recovery tests. Native and Docker smoke
commands are explicit opt-in checks; record their actual platform/results
separately rather than inferring them from local unit tests or templates.
