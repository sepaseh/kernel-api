# Develop Kernel API

Use this guide to run the API with your own local configuration. For a
temporary database, uploads and seeded test data, use the
[disposable API fixture](../README.md#run-locally).

## Local execution

1. Use the Node.js version in [`.nvmrc`](../.nvmrc). From the repository root,
   install the locked dependencies.

   ```sh
   npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
   ```

2. For a new local setup, create an ignored `.env.local` from the
   [synthetic configuration template](../.env.example). Preserve any existing
   file. Set `BETTER_AUTH_SECRET` to a new random value and choose a fresh
   database and upload location. For example, create `server/data/development`
   if it is unused and set `DATABASE_URL=file:server/data/development/kernel.sqlite`
   and `LOCAL_STORAGE_PATH=server/data/development/uploads`. Relative database
   and upload paths resolve from the repository root. Use `STORAGE_DRIVER=local`
   for disk storage. The API creates the directories as needed.
3. Keep `HOST` on loopback for local development. Match `BETTER_AUTH_URL` to the
   API origin, including the port, and set `SERVER_ALLOWED_ORIGINS` to the
   comma-separated origins of any browser clients. If port 3000 is occupied,
   choose an available port and update both `PORT` and `BETTER_AUTH_URL`.
4. Load the configuration explicitly and start the API.

   ```sh
   node --env-file=.env.local src/index.ts
   ```

   The launching process's environment takes precedence over the file. If you
   supply configuration through the process environment, use `npm run dev` or
   `npm start`. Both commands run the same entry point and require you to load
   any environment file yourself.

5. Open `/health` on the configured API origin, such as
   `http://localhost:3000/health`. It returns HTTP 200 and `{"status":"ok"}`
   after initialization. A temporary HTTP 503 during startup means the listener
   is up and initialization is still in progress. Check the startup log if the
   server exits. See the [HTTP transport guide](http-transport.md).

Keep credentials and private environment files outside Git. To exercise OTP
flows locally, set `OTP_FIXED_CODE` explicitly with `NODE_ENV=development` or
`NODE_ENV=test`. Production OTP delivery is unavailable.

## Website test fixture

`npm run test:fixture:website` starts the disposable API on
`http://127.0.0.1:3100` with seeded data. Follow the
[Bruno setup](../collection/README.md#connect-bruno-to-the-local-api)
to sign in with the fixture's test account. For concurrent runs or a port conflict, set
`WEBSITE_TEST_API_PORT` to a distinct available port and configure the website test
client to use that same API origin. The allowed website origin remains
`http://127.0.0.1:3101`.

## Database initialization and administrator provisioning

Startup applies the reviewed migrations and initializes settings for the
configured database. Source publication does not authorize changing existing
runtime data. Obtain explicit authorization and a verified matching backup
before migrating an existing database; do not use another checkout's data.

`npm run server:bootstrap` reads a JSON object with `first_name`, `last_name`,
`mobile`, `username` and `password` from standard input. Provide it from a
private input source with the intended database configuration in the process
environment. When using `.env.local`, you can invoke
`node --env-file=.env.local src/bootstrap-admin.ts` with the same input.
The command requires a database with no users and creates the administrator and
credential atomically without starting a session. It prints
`Initial administrator created.` on success. See the
[authentication adapter guide](auth-adapters.md) and
[database schema](database-schema.md).

For sample data in a fresh local database, set `SERVER_SEED_DEVELOPMENT_DATA=true`
with `NODE_ENV=development` or `NODE_ENV=test` and start one instance.
Seeding refuses a nonempty
business database without the complete expected sample administrator and fails
explicitly on an incomplete earlier seed. The emptiness check and sample
business records share a transaction; migrations and initial settings happen
separately before it.

`npm run server:generate` generates migration changes from the schema without
requiring database credentials. `npm run server:migrate` applies reviewed
migrations using an explicit `DATABASE_URL`; select only an owned fixture or a
database you are authorized to change. The startup initializer applies reviewed
SQL and does not generate migrations. Toolchain tests copy the configuration
into owned fixtures and exercise the real CLI using synthetic state.

## Find the code and tests

Use [source navigation](source-navigation.md) to locate the owning layers,
[feature development](feature-development.md) for contract changes, and
[validation](validation.md) before publication. Coordinate incompatible HTTP
changes with independently released API consumers.

## Dependency compatibility

Keep the runtime pinned by `.nvmrc` and `@types/node` on the same major. Respect
the installed TypeScript/ESLint peer ranges and upgrade `better-auth`,
`@better-auth/drizzle-adapter` and the `@better-auth/core` override together.
Refresh the lockfile and run the full validation profile after dependency
changes. Do not use `--force` or `--legacy-peer-deps` to hide an incompatible tree.

The lint toolchain currently pins the `@ryotsu/picomatch` backport. The
[original GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
was withdrawn on November 18, 2026. Snapshot validation still checks the
override's exact registry integrity and development-only lockfile scope.

Drizzle Kit's legacy loader uses the reviewed scoped esbuild override `0.28.2`.
Keep that compatibility choice aligned with the lockfile and the real
toolchain tests. See the [deployment guide](deployment.md) for packaging,
runtime configuration checks and opt-in Docker or native checks.
