# API validation

The [canonical manifest](../.agents/validation.json) owns commands and profiles.
Run `npm run validate -- full` against an isolated export of the exact
[publication inventory](../.github/bootstrap-policy.json) before each authorized
commit or PR. Preserve unrelated files in the working checkout.

The full profile runs every required check declared by the current manifest,
including source boundaries, typechecking, lint, measured published-source and
tooling coverage, and audit-helper tests. The manifest owns the complete
commands and order. Each source phase requires its own validation evidence.

Run the complete profile for every PR, including drafts and documentation-only
changes, without changed-path or target-branch filters. Use pure and fake-port
tests for service behavior, and real synthetic fixtures for database,
authentication adapter, storage and HTTP behavior.

CI displays each real suite separately and partitions the canonical full gate:

| Job                   | Manifest profile | Required work                                                                             |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Static checks         | `ci-quality`     | Snapshot, CI policy, actionlint, boundaries, types, lint, formatting and guidance         |
| Dependency audit      | `ci-audit`       | Locked dependency audit                                                                   |
| Unit tests            | `ci-unit`        | Application policy, validation, configuration, localization and isolated adapter behavior |
| API integration tests | `ci-integration` | Owned database, authentication, storage, HTTP, runtime and recovery fixtures              |
| Governance tests      | `ci-governance`  | Policy, tooling, hooks, collections, synthetic operations and audit-helper tests          |

Each published test belongs to one suite and runs once. The required `check`
context first rejects missing, failed, skipped or cancelled jobs. It then verifies
all three test artifacts and computes the combined coverage without rerunning
tests or installing dependencies. Coverage must satisfy the original independent
minimums of 80% lines, branches and functions for the non-audit sources and 80%
for the audit helper. Both groups must pass independently.

Each test producer publishes its measured LCOV, raw V8 coverage and provenance
under `coverage/<suite>/` in an immutable
`coverage-<suite>-<run>-<attempt>` artifact. Governance also preserves the audit
helper's separately measured LCOV and raw V8 data. Verification binds every
input to the same source, workflow run and actual producing attempt. The
coverage merger uses the raw measurements to preserve function and branch
identity across suites.

`check` publishes `coverage/lcov.info` and
`coverage/combined/ci-evidence.json` as
`coverage-combined-<run>-<attempt>`. This attestation includes the identities and
hashes of all three verified input manifests. Sonar consumes that successful
check's report and verifies its provenance and measured bytes before scanning.
An analysis-only rerun uses the successful check's original attempt. A rerun of
`check` verifies the current producer outputs and publishes a new combined
artifact. Sonar imports the existing result without rerunning tests or coverage
aggregation. Scanner execution and the provider's quality-gate result are
separate evidence. Missing configuration, failed audit requests, absent reports,
stale source or provider skips must remain visible.

Local `full` validation runs the same required checks and coverage summary in
the manifest's declared order. `test:coverage` remains a convenience coordinator
for the three test suites and coverage summary; `test:audit` retains its focused
audit-helper check. Run the selected command once for the intended scope. The
suites include foundation, service, catalog, adapter, HTTP, local runtime and
operations tests. Operations fixtures exercise migration tooling, packaging,
deployment configuration, recovery and target validation. Native and Docker
smoke commands run separately on request. Browser checks belong to the API's
consumers, and local execution uses the TypeScript entry point directly.

Coverage aggregation requires the exact pinned Node runtime and its supported
native coverage interfaces. The merger fails when that runtime or interface
changes. When updating Node, update the coverage compatibility guard and its
regressions, then run the complete gate with the proposed runtime. The
[coverage merger](../scripts/merge-coverage.mjs) and
[its tests](../scripts/merge-coverage.test.mjs) own this boundary.

`npm run check:actions` runs the official actionlint binary over the actual
`.github/workflows` files. The runner pins its version and verifies the release
archive checksum before executing the extracted binary. It reads cached archive
metadata and bytes through the same open file handle. Downloads stop when the
stream exceeds the archive size limit. Verified archives are written and closed
in private staging directories on the cache filesystem, then published through
an exclusive hard link. Existing cache entries are never overwritten. Cleanup
removes only owned staging paths and preserves write, close and cleanup errors;
a competing ordinary cache file remains untouched.
The cache filesystem must support hard links. On a volume that rejects them,
`npm run check:actions` and the local `full` gate fail on each cache miss;
the runner does not fall back to writing directly to the shared cache path.
This required check runs once in Static checks and once within each separately
requested local `full` gate; it does not add another CI job or suppress lint findings. Optional ShellCheck and
Pyflakes integrations are disabled so actionlint has the same scope on supported
Windows and Linux hosts.

The source-boundary and lint checks share process-ownership rules. Environment
configuration remains infrastructure-owned. Pure source must use explicit
process properties; whole-object captures, rest copies and nonliteral process
keys are rejected. Native loaders stay direct so their literal module targets
remain checkable. Process-module promise callbacks are rejected; use named
imports or await the module before explicit property access. Application code may
import permitted native utilities by name; contracts retain their local-only
import rule. These are source-syntax
checks against the literal Node entry-point names `process`, `globalThis`,
`global` and `module`; they do not resolve locally shadowed bindings or perform
general alias or data-flow tracking.

The [CodeQL workflow](../.github/workflows/codeql.yml) analyzes admitted JavaScript, TypeScript
and GitHub Actions workflows using `security-extended` queries without installing dependencies
or executing application builds. It runs for every PR base, including stacked
PRs, main pushes, weekly and manual events. Its analysis job can upload security
results but cannot write repository contents. The manifest records this hosted
security workflow separately from local checks; local policy tests validate its
configuration and do not claim to run CodeQL. Inspect the actual current-head
native `CodeQL` result before merge or any CodeRabbit request.

Manual operations workflows handle release metadata, staging verification and
deployment smoke verification. The DAST workflow validates the target and stops
before running a scan. The [operations policy](../scripts/check-operations-policy.mjs)
checks permissions, triggers, concurrency and target controls in Static checks.
Native CodeQL uses its own
workflow policy and runs independently. Policy tests and local fixtures do not
establish that a manual workflow ran or that a deployment is ready.

PR file count is advisory [pre-PR planning](../CONTRIBUTING.md#scope-and-pr-planning),
not an automated validation or merge limit. Native provider checks and the native
approval count enforce review requirements without a custom approval publisher.
Main-branch protection applies to PRs targeting `main`. Retarget stacked PRs
after prerequisites merge and obtain fresh checks for the current head and base.
Neither local configuration nor a local pass proves remote protection is active.

An explicit request to publish ready for review may be followed while provider
results remain pending. Report those limits; the PR status does not waive the
CodeRabbit preflight, establish a quality gate or authorize merging.

Use disposable owned fixtures. Report actual QA results in the current chat;
create a report only on explicit request under ignored `test-results/`.
