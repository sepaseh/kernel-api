# Infrastructure-support phase and validation

[English](bootstrap.md) · [فارسی](bootstrap.fa.md)

This snapshot is in the **infrastructure-support** phase. Its exact inventory is
[bootstrap-policy.json](../.github/bootstrap-policy.json), and `applicationReady`
remains **false**. Pure contracts, core modules, feature ports and the seven
account, authentication, calendar, files, roles, settings and users services are
published, together with ten flat API catalogs, their registry, the i18next
adapter, configuration validation, Pino logging/redaction and fatal process
handlers. HTTP, DB/migrations, concrete authentication/storage adapters,
initial-administrator setup and deployment are not included.

Read [README](../README.md) for the source map, [architecture](architecture.md)
for ownership and limitations, and [Contributing](../CONTRIBUTING.md) for the
change workflow. i18next and Pino are runtime dependencies; pino-pretty is a
development dependency. This snapshot does not start an API.

## Exact snapshot and complete phase gate

Use Node.js from [`.nvmrc`](../.nvmrc), within the supported range in
[`package.json`](../package.json), and the npm bundled with that Node release,
matching CI:

```sh
npm ci
npm run validate -- full
```

The [canonical validation manifest](../.agents/validation.json) defines all
required checks: snapshot integrity, semantic CI policy, dependency audit, source
boundaries, types, lint, formatting, coverage-backed tests and audit-helper tests.
Run the entire
`full` profile before an explicitly authorized commit or PR handoff. Focused
development tests do not replace it.

Every PR, including drafts and documentation-only changes, runs all nine required
checks through `npm run validate -- full` after `npm ci`. No changed-path or PR
branch filter narrows this gate. The runner validates the complete inventory
before execution: every required check appears once in `full`, with no duplicate
IDs, unknown checks or optional checks. Its declared execution order and first
failure are preserved.

The semantic YAML policy checks the actual workflow rather than matching its
formatting. It rejects duplicate keys, narrowed PR triggers, conditional/advisory
check execution, incorrect install/full ordering, custom shells or working
directories and undeclared runner/job transitions. All current phase checks
belong to the Ubuntu `check` job; a later multi-job runtime phase must update this
policy deliberately rather than silently moving platform-specific checks.

Validate an isolated checkout/export of the exact proposed snapshot. The guard
rejects missing or unexpected maintained files, symlinks and private paths;
ambient untracked source must not make a partial PR appear complete. This phase
requires all seven service modules, the five declared pure application test
files, all ten language data files and their registry, the declared support
modules and their data, configuration, engine, logging and lifecycle tests.
Adding a path to the inventory alone cannot admit an unreviewed module,
concrete adapter or runnable entry point. The **100-file cap applies to each
PR's GitHub changed-file list**, not the repository's total file count.

Tests need no real environment, database, bucket or running API. Keep secrets and
runtime state outside source and synthetic fixtures.

## What the evidence covers

Fake-port application tests check validation, authorization, semantic errors,
language authority, operation ordering and preservation of the original metadata
failure when compensating file cleanup fails. Existing foundation and governance
tests remain in the complete gate.

Catalog tests compare all supported language codes and the complete application
message vocabulary, verify flat nonempty strings and identical interpolation
variables, and check that the registry preserves each original object. AST checks
keep language modules literal data without engine imports, fallback spreads or
executable logic. Separate tests exercise actual i18next resolution, English
fallback and interpolation for all ten languages. The catalog and engine checks
do not establish HTTP localization or persisted-language selection.

Configuration tests use synthetic environment objects and validate explicit MinIO
credentials, numeric settings and driver selection without opening external
services. Pino tests check structured fields, safe error causes/query-shaped
failures, redaction, request-context concurrency and development pretty output.
Fatal-handler tests use isolated subprocesses to check logging, flushing and exit;
the unpublished HTTP entry point's startup-failure behavior remains deferred.

`npm run test:coverage` produces actual `coverage/lcov.info` from published
application source, catalog data, infrastructure support and tested repository
scripts in this checkout. Audit-helper
tests are also required by the full profile. Generated reports are not committed.
Fake ports do not establish real DB transactions, concurrency, cookies, OTP
delivery or storage behavior and do not prove a runnable API is ready.

Use the existing [CI](../.github/workflows/ci.yml) and
[Sonar workflow](../.github/workflows/sonar.yml); do not add a duplicate scanner.
Inspect the actual hosted run, analyzed revision and provider quality gate
before reporting success. See [Sonar setup](sonarqube.md).

## Pull request cycle

1. Work on a focused `codex/<purpose>` branch and inspect its complete base diff.
2. Keep each PR at **100 or fewer GitHub changed-file entries**. Additions,
   removals, renames and binaries count; a GitHub rename is one entry.
3. Run the complete current-phase gate on the exact proposed snapshot and record
   the revision, phase, commands, results and limitations.
4. With explicit authorization, publish the PR using the
   [template](../.github/PULL_REQUEST_TEMPLATE.md). Keep incomplete work in draft.
5. Complete the [CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit):
   every required non-CodeRabbit check, Sonar scanner execution and the actual
   quality gate must pass for the exact current head. The complete applicable
   Sonar report must have zero open/unresolved issues at every severity,
   including existing issues. Missing, pending, skipped, failed or stale evidence
   blocks requests; every new commit invalidates this preflight.
6. Only then request one review within an authorized cycle. Read actual findings,
   fix defects and repeat step 5 before re-review. Respect quotas and one
   in-flight request per head. Before a new request, verify at least one hour has
   elapsed since the repository's latest CodeRabbit review. A skipped status or documented but still-open
   false positive does not satisfy the prerequisites; do not bypass them through
   automatic triggers, suppressions or weaker requirements.
7. Merge only after required CI, native CodeRabbit/Sonar checks, an approving
   review and resolved conversations. Follow
   [branch protection](branch-protection.md); configuration and a skipped progress
   status do not establish substantive review.

The [PR policy](../.github/workflows/pr-policy.yml) runs trusted default-branch
code with read-only permissions, pinned to `github.workflow_sha`. Never execute
PR-head code or an unreviewed target checkout in that privileged event. Complete
pagination and stable PR head/base metadata are required for file-count evidence.

## Introducing a runnable phase

Add HTTP transport and concrete adapters through coherent,
reviewed changes. Introduce the full HTTP, DB, authentication and storage tests
and expand the canonical full gate when those implementations arrive. Update
the inventory, workflows, analysis scope and branch-protection contexts together;
verify replacement checks before retiring obsolete ones.

Do not set application readiness to true because the infrastructure-support gate passes.
Do not use broad allowlist changes, placeholder behavior or unrelated untracked
source as evidence that a runnable API works. Preserve the per-PR 100-file cap
through subsequent phases.
