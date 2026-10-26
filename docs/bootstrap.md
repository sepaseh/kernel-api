# Foundation phase and validation

[English](bootstrap.md) · [فارسی](bootstrap.fa.md)

This snapshot is in the **foundation** phase. Its declared inventory is
[bootstrap-policy.json](../.github/bootstrap-policy.json), and
`applicationReady` remains **false**. The project contains pure contract modules,
framework-free application primitives and adapter interfaces. Feature services,
HTTP routes, DB/migrations, concrete authentication/storage adapters and
deployment are not included.

Read [README](../README.md) for the current source map and
[Contributing](../CONTRIBUTING.md) for the change workflow. This phase has a local
development toolchain with no runtime dependencies; it does not start an API.

## Exact snapshot and complete phase gate

Use Node.js from [`.nvmrc`](../.nvmrc), the supported range in
[`package.json`](../package.json) and npm 12:

```sh
npm ci
npm run validate -- full
```

The [canonical validation manifest](../.agents/validation.json) defines all
required checks for this phase: snapshot integrity, dependency audit, source
boundaries, types, lint, formatting, coverage-backed tests and audit-helper tests.
Run the entire `full` profile before an explicitly authorized commit or PR
handoff. Focused tests during development do not replace it.

Validate an isolated checkout/export of the exact proposed snapshot. The
inventory guard rejects missing or unexpected maintained files, symlinks and
private paths; extra untracked source must not make a partial PR appear complete.
The explicit allowlist describes repository content. The **100-file cap applies
to each PR's GitHub changed-file list**, not to the size of that inventory.

No real environment, database, bucket or running API is needed for foundation
tests. Keep secrets and runtime state outside source and test fixtures.

## What the evidence covers

The test suite preserves PR-size and snapshot-governance checks and adds pure
foundation, validation, source-boundary, validation-runner and audit-helper tests.
It covers the current published scope, including authorization, semantic errors,
canonical permissions, authentication identity and language metadata.

`npm run test:coverage` generates actual `coverage/lcov.info` from the tested
foundation and repository scripts in this checkout. The separate audit-helper
test command is also required by the full profile. Generated reports are not
committed. Foundation/tooling coverage is not HTTP, DB, authentication-service
or storage coverage and does not prove a runnable API is ready.

Use the existing [CI](../.github/workflows/ci.yml) and
[Sonar workflow](../.github/workflows/sonar.yml); do not add a duplicate scanner
workflow. Inspect the actual hosted run, analyzed revision and provider quality
gate before reporting success. See [Sonar setup](sonarqube.md).

## Pull request cycle

1. Work on a focused `codex/<purpose>` branch and inspect its complete base diff.
2. Keep each PR at **100 or fewer GitHub changed-file entries**. Additions,
   removals, renames and binaries count; a GitHub rename is one entry.
3. Run the complete current-phase gate on the exact proposed snapshot and record
   the revision, phase, commands, results and limitations.
4. With explicit authorization, publish the PR using the
   [template](../.github/PULL_REQUEST_TEMPLATE.md). Keep incomplete work in draft.
5. Read CodeRabbit findings, fix actionable defects and rerun affected checks.
   A skipped review is not a completed review. Request one review within the
   authorized cycle if needed; respect quotas and disclose pending re-review.
6. Verify real Sonar analysis and its native quality gate separately.
7. Merge only after required CI, native CodeRabbit/Sonar checks, an approving
   review and resolved conversations. Follow
   [branch protection](branch-protection.md); configuration and a skipped progress
   status do not establish substantive review.

The [PR policy](../.github/workflows/pr-policy.yml) runs trusted default-branch
code with read-only permissions, pinned to `github.workflow_sha`. Never execute
PR-head code or an unreviewed target checkout in that privileged event. Complete
pagination and stable PR head/base metadata are required for file-count evidence.

## Introducing a runnable phase

Add feature services, HTTP transport and concrete adapters through coherent,
reviewed changes. Introduce the full HTTP, DB, authentication and storage tests
and expand the canonical full gate when those implementations arrive. Update
the inventory, workflows, analysis scope and branch-protection contexts together;
verify replacement checks before retiring obsolete ones.

Do not set application readiness to true because the foundation gate passes.
Do not use broad allowlist changes, placeholder behavior or unrelated untracked
source as evidence that a runnable API works. Preserve the per-PR 100-file cap
through subsequent phases.
