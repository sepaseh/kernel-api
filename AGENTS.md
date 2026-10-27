# Kernel API local-storage instructions

Read [README](README.md), [Contributing](CONTRIBUTING.md), the current
[publication inventory](.github/bootstrap-policy.json) and the canonical
[validation manifest](.agents/validation.json) before changes.

This standalone npm project publishes contracts, application services, ports,
ten flat API catalogs and infrastructure support for configuration, translation,
logging, fatal process failures and local filesystem object storage in the storage-local phase. Keep
application code framework free and dependencies within this checkout; read
[architecture](docs/architecture.md). Catalog data belongs in
src/infrastructure/localization/catalogs; its index exposes each canonical object.
Keep application vocabulary imports fully erased and application code independent
of infrastructure. Catalogs contain literal strings only: no fallback spreads,
executable logic or engine imports. The separate localization/i18n.ts adapter uses
i18next; logging uses Pino, with pino-pretty restricted to development. Configuration
parses an explicit environment object or process.env without loading private files.
Require explicit MinIO credentials when that driver is selected and reject invalid
driver/numeric settings. Test configuration with synthetic inputs and fatal handlers
in isolated subprocesses. The HTTP server, database, authentication adapters,
MinIO and storage composition belong to later reviewed phases. Keep
applicationReady false; pure fake-port tests do not establish runtime readiness.
Soft deletion is prohibited: business references must block hard deletion with a
semantic conflict, without partial effects. Future HTTP adapters map that conflict
to a localized 409; future persistence adapters must enforce atomic invariants.

Run `npm run validate -- full` before an authorized commit or PR. Test the exact
proposed tree. Keep each PR at 100 or fewer changed files, including deletions and
renames; the total repository may grow beyond 100 files. Preserve private state,
never read real environment files or credentials, and require explicit user
authorization for commits, pushes, remote comments and merging.

Every PR, including drafts and documentation-only changes, runs all nine required
checks for the published storage-local snapshot through that same full
profile. Keep the semantic CI policy check: no PR path/branch filters, conditional
or advisory full execution, hidden command omissions or implicit runner/job
transitions. A focused development profile cannot replace the full PR gate.
Catalog tests must preserve supported-language and message-vocabulary parity,
flat nonempty values, interpolation placeholders and canonical object identity.
Engine tests must exercise real resolution and interpolation for all ten languages.
Logging tests must protect structured context and redact credentials, private fields
and error details. Subprocess tests establish fatal logging/flush/exit behavior;
HTTP startup failures remain unvalidated until the server entry point is published.
Local-storage tests must use fresh owned temporary directories, remove their own
fixtures and verify exact bytes, exclusive creation, hard deletion and rejected
bucket/path escapes. The storage directory must be controlled by the API process;
lexical containment does not prevent a host user from inserting symlinks. Keep safe
storage diagnostics free of raw failures and preserve the original failure if
logging throws. Do not publish the MinIO/factory or unused storage helpers merely
by extending the inventory.
The narrow Sonar duplication exception names only the ten catalog data files;
locale metadata and the registry retain duplication analysis. Keep source, rule and coverage
analysis enabled; adding executable catalog logic requires revisiting the exception.

Use ordinary CodeRabbit, SonarQube Cloud and CI checks. Before any CodeRabbit
request or re-review, enforce the
[preflight](docs/sonarqube.md#before-requesting-coderabbit): all current-head required
non-CodeRabbit checks, Sonar scanner and actual quality gate must pass, with zero
open/unresolved Sonar issues at every severity. A new commit invalidates evidence;
missing, pending or skipped results block requests. Respect quotas and one
in-flight request per head; never bypass the order with automatic triggers.
Verify that at least one hour has elapsed since the latest CodeRabbit review
before a new request; keep an in-flight request pending rather than duplicating it.

Keep assistant guidance in English and maintained human documentation in English
and Persian. Runnable API
publication must add its complete HTTP, database, authentication, storage and
architecture validation before declaring application readiness.
