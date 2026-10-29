# Kernel API local runtime instructions

Read [README](README.md), [Contributing](CONTRIBUTING.md), the current
[publication inventory](.github/bootstrap-policy.json) and the canonical
[validation manifest](.agents/validation.json) before changes.
Use [guidance](.agents/README.md), the [settings index](.agents/settings.json)
and [source navigation](docs/source-navigation.md) to find the rules and
evidence relevant to the task.

This standalone npm project publishes contracts, application services, ports,
ten flat API catalogs and infrastructure support for configuration, translation,
logging, fatal process failures, local/MinIO object storage, a database schema,
reviewed migrations, persistence, authentication adapters, Hono route adapters
and local server composition in the local-runtime phase. Keep
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
in isolated subprocesses. The storage factory selects local or S3-compatible
MinIO storage; the latter owns the AWS S3 SDK and uses explicit credentials,
endpoint and region. Read [object storage](docs/object-storage.md). Require TLS
outside localhost or literal loopback endpoints, owned public/private buckets, exclusive
creation and unversioned buckets. Reject versioning before writes/deletes;
never introduce delete markers or silently change versioning. Optional MINIO_REGION
defaults to us-east-1; validate its literal signing-region label and never follow
endpoint redirects or use AWS profile/metadata credentials. The local Node server
and composition are included. Keep applicationReady false: production OTP delivery,
deployment and deployed integrations are not established by local tests.
Soft deletion is prohibited: business references must block hard deletion with a
semantic conflict, without partial effects. HTTP adapters map that conflict
to a localized 409; published persistence adapters must enforce atomic invariants.

Database SDKs belong only in their exact owned database and persistence modules;
never expose their types in application ports. Read [database schema](docs/database-schema.md).
Use real libSQL/Drizzle tests against fresh owned temporary or in-memory databases,
close clients and remove only owned fixtures. Verify fresh and populated-upgrade
migrations, schema/metadata parity, foreign-key enforcement, transactional rollback,
reference conflicts and system-language preservation. Business references, including
settings logo files, use RESTRICT; only owned technical identity records may cascade.
Profile patch ports carry changed name/mobile fields, never a stale composed-name hint.
Persistence derives full names atomically from provided parts and current database
columns in one bound SQL update. Authentication, OTP persistence, initialization
and initial administrator provisioning are included; production OTP delivery remains unpublished.

Run `npm run validate -- full` before an authorized commit or PR. Test the exact
proposed tree. Keep each PR at 100 or fewer changed files, including deletions and
renames; the total repository may grow beyond 100 files. Preserve private state,
never read real environment files or credentials, and require explicit user
authorization for commits, pushes, remote comments and merging.

Every PR, including drafts and documentation-only changes, runs all required
checks for the published local-runtime snapshot through that same full
profile. Keep the semantic CI policy check: no PR path/branch filters, conditional
or advisory full execution, hidden command omissions or implicit runner/job
transitions. A focused development profile cannot replace the full PR gate.
Catalog tests must preserve supported-language and message-vocabulary parity,
flat nonempty values, interpolation placeholders and canonical object identity.
Engine tests must exercise real resolution and interpolation for all ten languages.
Logging tests must protect structured context and redact credentials, private fields
and error details. Subprocess tests establish fatal logging/flush/exit behavior;
runtime tests must also exercise startup failure, cleanup and shutdown using
disposable local fixtures. The local listener binds before database or storage
initialization and serves non-cacheable 503 responses until ready; an occupied
port must fail before those resources are initialized. Exercise real Unix signals
and the Windows signal-message simulation in their respective environments.
Run development seeding with one instance; it refuses a nonempty business database
without the sample administrator and fails explicitly on an incomplete seed from
an older run. The emptiness check and sample business records share one transaction;
migrations and initial settings happen separately before that transaction.
Local-storage tests must use fresh owned temporary directories, remove their own
fixtures and verify exact bytes, exclusive creation, hard deletion and rejected
bucket/path escapes. The storage directory must be controlled by the API process;
lexical containment does not prevent a host user from inserting symlinks. Keep safe
storage diagnostics free of raw failures and preserve the original failure if
logging throws. Object-storage tests must exercise the real signed SDK against
an owned loopback HTTP fixture with synthetic credentials and isolated empty AWS
profiles. Block external network and metadata/profile discovery; verify cleanup,
conditional writes, versioning refusal, policies and stream failures. This is
protocol evidence, not a deployed MinIO integration. Do not publish unused memory
helpers or unrelated entry points merely by extending the inventory.
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
Before a new request, verify that at least one hour has elapsed since both the
latest manual request and latest substantive CodeRabbit review in this repository,
including current and recent PRs. Honor a later provider retry time; keep an
in-flight request pending rather than duplicating it.

Keep assistant guidance in English and maintained human documentation in English
and Persian. Local runtime publication must preserve complete HTTP, database,
authentication, storage and architecture validation without claiming production
readiness.
