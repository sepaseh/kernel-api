# Testing

Follow the [published scope](../README.md#published-scope).

## Choose checks

Start with the smallest declared check that covers the changed behavior. Select
commands from the [validation manifest](../validation.json).

Check affected [package scripts](../../package.json) and owning tests. For source
or dependency changes, run the relevant typecheck, lint and
[boundary checks](imports.md#verify-boundaries) alongside affected behavior tests. For wire changes, follow the
[HTTP contract workflow](api-collection.md#change-a-contract).

Use application tests with fake feature ports for business policy. Use real
database, authentication, storage and HTTP integration tests with disposable
SQLite databases and owned synthetic resources for claims about those
boundaries. Cover transactions and lifecycle behavior in the owning suite.
Preserve the import-boundary checks, contract and catalog purity checks, and
catalog key and placeholder checks. Independently released clients own their
component, browser and Pact checks.

Follow the [full validation policy](../../docs/validation.md) for an authorized
commit or PR, including drafts and documentation changes.

## Test placement

Keep focused application and infrastructure tests beside their owners as
`<module>.test.ts`. Put broad suites in `src/test/integration/`, dependency and
toolchain checks in `src/test/architecture/`, and shared source fixtures in
`src/test/support/`. Production code must not import test support.

Keep `scripts/` flat: focused tests use `<script>.test.mjs`; cross-script scenarios
use descriptive integration suites. Share setup in `deployment.test-support.mjs`
and `package-release.test-support.mjs`; these are helpers, not runnable suites or
production dependencies. Move existing cases without duplicating assertions.

## Test behavior and fixtures

Use [synthetic fixtures](safety.md#secrets-and-local-state) and disposable
resources owned by the test. Exercise observable success and failure.

Test atomic invariants directly. Use small synthetic factories, deterministic
data and real concurrent transaction and rollback cases when stale reads matter.
Distinguish provider outages from client-validation failures. Start a dedicated
test API for the fixture when needed.

## Synchronize and clean up

Synchronize with observable readiness, completion, errors and close events. Use
controlled clocks for timing behavior and explicit cancellation for interrupted
work. Preserve the first operation failure and any cleanup failures.

Keep fixed sleeps, polling budgets, custom test, process or request deadlines,
and delayed cleanup retries out of asynchronous tests and smoke tools. Use domain
durations and timestamps as test inputs.
Close streams, listeners and child processes before removing their fixtures. When
a native database driver has no asynchronous handle-release notification, own the
file-backed scenario in a child process and remove its directory after child close.
Deployment tests validate immutable packaging, placeholder/origin/persistence
preflight, Nginx rendering, readiness and protected workflow targets with disposable
fixtures. Optional native/Docker smoke tools verify owned synthetic resources only;
report actual environment limits. See [testing](../../docs/testing.md),
[deployment](../../docs/deployment.md) and [backup/recovery](../../docs/backup-restore.md).

Prefer the scoped scripted Docker smoke. After every local Docker test, including
manual tests, remove its exact owned containers, volumes/networks, images, builder
cache and temporary files on success and failure. Use a disposable per-run builder;
never use a routine global prune that can delete another project's cache or data.
Do not hide cleanup failures or report an unclean run as successful.
