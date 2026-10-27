# Contributing to Kernel API

[English](CONTRIBUTING.md) · [فارسی](CONTRIBUTING.fa.md)

The current [auth-bootstrap phase](docs/bootstrap.md) contains contracts,
application services, ports, ten static catalogs and configuration, translation,
logging, fatal-lifecycle support, local/MinIO object storage and real database
schema, migrations, authentication and initial administrator provisioning. It is
not a runnable API.
Contributions must preserve this declared scope and the independent project
boundary.

## Scope and source ownership

Keep pure wire definitions in `src/contracts/`, framework-free core code in
`src/application/` and dependency interfaces in `src/application/ports/`.
Do not import another checkout, add local-package links or introduce runtime
framework, DB or storage dependencies into these pure layers. Use the existing
boundary check rather than weakening it to permit a new dependency.

Framework, database and storage SDK types also belong in adapters, not in
application interfaces. Erasing an import at runtime does not remove this source
coupling. Local application/contract type imports remain valid; the boundary
checker distinguishes fully erased declarations from imports that still load a
module under Node's TypeScript stripping.

Keep API catalog data under `src/infrastructure/localization/catalogs/`, with
one flat literal string object per supported language and the canonical registry
in `index.ts`. Catalogs may use fully erased application message types; the
registry may also use the locale contract type. Application code must never
import infrastructure. Keep fallback spreads, executable logic and engine imports
out of catalog data. The separate `localization/i18n.ts` adapter owns i18next.
Preserve complete message keys and
interpolation placeholders in all ten genuine translations.

The exact maintained inventory is declared by
[`.github/bootstrap-policy.json`](.github/bootstrap-policy.json). Update that
inventory deliberately when adding a reviewed phase file. Its allowlist is
not the 100-file PR limit: the repository may contain more than 100 files, while
each PR must still change no more than 100 GitHub file entries.

Preserve unrelated work, private environment files, credentials and runtime data.
Application tests use synthetic fake ports and local fixtures. Configuration tests
pass synthetic environment objects; never load private environment files. MinIO
selection requires explicit credentials; invalid numeric or driver settings fail.
Local-storage tests must use fresh owned temporary directories, verify bucket/key
containment, exclusive writes, byte preservation and hard deletion, and clean up
their exact fixtures. Never use an existing upload directory. This adapter assumes
the API process controls its storage root; lexical path checks are not a symlink
sandbox. MinIO tests must use the real S3 SDK, synthetic credentials, isolated
empty AWS profile files and an owned loopback HTTP fixture with other network
access blocked. Preserve exclusive creation, owned bucket policies, versioning
refusal and original stream failures. Read [object storage](docs/object-storage.md);
these protocol tests do not establish a deployed MinIO integration.
Use real i18next/Pino for support tests and isolated child processes for fatal
handlers. Never use real databases, uploads or production services to validate this phase.

Database SDK imports are restricted to their exact owned adapters; application
ports stay framework free. Read [database schema](docs/database-schema.md). Test
real libSQL/Drizzle migrations and repositories with owned temporary/in-memory
databases; close every client and clean up only those fixtures. Cover populated
upgrades, schema/metadata parity, active foreign keys, rollback, usage conflicts,
canonical permission mapping and persisted language/branding. Logo references
must block file deletion rather than clear themselves. Initialization, OTP/auth persistence and initial administrator provisioning are included;
HTTP and production OTP delivery remain outside this phase.

## Development and validation

Use [`.nvmrc`](.nvmrc), the Node range in [`package.json`](package.json) and the npm bundled with that Node release, matching CI:

```sh
npm ci
npm run validate -- full
```

[`.agents/validation.json`](.agents/validation.json) is the canonical command
inventory. Start with the smallest relevant existing check while developing.
Before **every explicitly authorized commit or PR handoff**, run its entire
`full` profile on an isolated checkout/export of the exact proposed snapshot.
A passing check that can see other untracked source does not validate a partial
published PR. Do not skip, suppress or replace a failed required check.

Each PR runs all nine required checks for the published auth-bootstrap
snapshot after `npm ci`, through the same `npm run validate -- full` entry point.
This includes draft and documentation-only PRs; there are no changed-path or
branch filters. The runner rejects duplicate IDs, omitted required checks and
optional checks added to `full` before executing any command. Focused profiles
remain development tools. A semantic YAML policy check rejects conditional or
advisory full execution, custom shells/directories and undeclared job/runner
transitions.

The full phase includes the source/snapshot guards, dependency audit, type and
style checks, measured application/governance coverage and audit-helper tests.
Keep tests for authorization boundaries, semantic errors, canonical permissions,
identity, locale metadata, catalog completeness and object identity, literal-data
boundaries, validation and repository safety meaningful. Support coverage must
exercise engine interpolation, structured logging/redaction, configuration and
fatal log flushing/exits. HTTP startup-failure behavior requires the future
server entry point and is not established by these subprocess tests. Do not
fabricate LCOV, borrow another project's report or describe foundation coverage as
full API coverage. See [architecture](docs/architecture.md) for service ownership
and the limits of fake-port evidence.

A later runnable phase must introduce coherent HTTP transport and concrete adapters
with the complete HTTP, DB, authentication and storage tests and its full canonical
validation gate. This support-phase pass cannot replace those tests or establish
application readiness in advance.

## Before requesting CodeRabbit

Follow the [CodeRabbit preflight](docs/sonarqube.md#before-requesting-coderabbit)
before every request or re-review: all required non-CodeRabbit checks, including
protected build/end-to-end/visual jobs when required, Sonar scanner execution and
the actual quality gate must pass for the exact current head. The complete latest
applicable Sonar PR/branch report must have zero open/unresolved issues at every
severity, including existing issues. A new commit invalidates prior evidence;
missing, pending, skipped, failed or stale results block the request. Only
CodeRabbit's own status/approval is excluded to avoid a cycle. Fix issues or obtain
proper explicit authorization for a legitimate Sonar classification and verify
fresh zero-issue evidence; a written false-positive note is insufficient. Do not
weaken, exclude, suppress or waive findings just to request review. Respect quotas,
keep one request in flight per head and do not bypass the order with automation.
Before sending a new request, verify that at least one hour has elapsed since both
the latest manual request and latest substantive CodeRabbit review in this
repository, including current and recent PRs. Honor any later provider retry time.

## Pull requests and review

1. Work on a focused `codex/<purpose>` branch and inspect the entire base-to-head
   diff. Creating a branch does not authorize committing or publishing it.
2. Keep the PR at **100 or fewer GitHub changed-file entries**. Additions,
   removals, renames and binary files count; a GitHub rename is one entry.
3. Use a Conventional Commit title and the existing
   [PR template](.github/PULL_REQUEST_TEMPLATE.md). Describe the change, phase,
   exact checked revision, executed checks and remaining limitations.
4. Publish or modify remote state only when explicitly authorized. Keep incomplete
   work in draft. Do not commit credentials, runtime state or generated reports.
5. Complete the CodeRabbit preflight above before any authorized review request.
   Read actual findings and fix actionable defects. Every new commit requires
   fresh successful checks and zero-issue Sonar evidence before re-review;
   respect quotas and disclose pending re-review.
6. Merge only under the ordinary required CI, native CodeRabbit and Sonar checks,
   an approving review and resolved conversations. A skipped progress status is
   not evidence of substantive review. Verify the Sonar analysis and quality gate
   separately, as described in [Sonar setup](docs/sonarqube.md).

[Branch protection](docs/branch-protection.md) describes native enforcement.
Do not weaken those requirements to merge a phase transition. Local test results
and configuration files are not evidence of a successful hosted check.
