# Application-services phase and validation

[English](bootstrap.md) · [فارسی](bootstrap.fa.md)

This snapshot is in the **application-services** phase. Its exact inventory is
[bootstrap-policy.json](../.github/bootstrap-policy.json), and `applicationReady`
remains **false**. Pure contracts, core modules, feature ports and the seven
account, authentication, calendar, files, roles, settings and users services are
published. HTTP, DB/migrations, concrete authentication/storage adapters and
deployment are not included.

Read [README](../README.md) for the source map, [architecture](architecture.md)
for ownership and limitations, and [Contributing](../CONTRIBUTING.md) for the
change workflow. The toolchain has development dependencies and no runtime
dependencies; it does not start an API.

## Exact snapshot and complete phase gate

Use Node.js from [`.nvmrc`](../.nvmrc), within the supported range in
[`package.json`](../package.json), and the npm bundled with that Node release,
matching CI:

```sh
npm ci
npm run validate -- full
```

The [canonical validation manifest](../.agents/validation.json) defines all
required checks: snapshot integrity, dependency audit, source boundaries, types,
lint, formatting, coverage-backed tests and audit-helper tests. Run the entire
`full` profile before an explicitly authorized commit or PR handoff. Focused
development tests do not replace it.

Validate an isolated checkout/export of the exact proposed snapshot. The guard
rejects missing or unexpected maintained files, symlinks and private paths;
ambient untracked source must not make a partial PR appear complete. This phase
requires all seven service modules and the five declared pure application test
files. Adding a path to the inventory alone cannot admit an unreviewed module,
concrete adapter or runnable entry point. The **100-file cap applies to each
PR's GitHub changed-file list**, not the repository's total file count.

Tests need no real environment, database, bucket or running API. Keep secrets and
runtime state outside source and synthetic fixtures.

## What the evidence covers

Fake-port application tests check validation, authorization, semantic errors,
language authority, operation ordering and preservation of the original metadata
failure when compensating file cleanup fails. Existing foundation and governance
tests remain in the complete gate.

`npm run test:coverage` produces actual `coverage/lcov.info` from published
application source and tested repository scripts in this checkout. Audit-helper
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
   in-flight request per head. A skipped status or documented but still-open
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

Do not set application readiness to true because the application-service gate passes.
Do not use broad allowlist changes, placeholder behavior or unrelated untracked
source as evidence that a runnable API works. Preserve the per-PR 100-file cap
through subsequent phases.
