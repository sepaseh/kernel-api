# API testing

Use the canonical [validation manifest](../validation.json) and
[validation policy](../../docs/validation.md). Start with focused checks during
development; every required full-profile check runs before a requested commit/PR.

Choose pure application tests with fake feature ports for business policy; use real
TEMP SQLite/auth/storage for adapter, transaction, HTTP and lifecycle behavior.
Keep application and presentation import-architecture tests intact. Local contract/catalog
purity and key/placeholder integrity are separate source boundaries. API HTTP tests
and Bruno/DTOs define wire behavior; independently released clients own their own
component/browser/Pact consumer checks.

Test observable success/failure and atomic invariants, not implementation copies.
Use small synthetic factories, deterministic clocks/data where needed, and actual
concurrent transaction/rollback cases when stale reads matter. Preserve provider
outage versus client-validation failures. Tests must never load operator env,
existing DB/bucket/uploads or an already running developer API.

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
