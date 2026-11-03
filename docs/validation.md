# Foundation validation

The [canonical manifest](../.agents/validation.json) owns commands and profiles.
Run `npm run validate -- full` against an isolated export of the exact
[publication inventory](../.github/bootstrap-policy.json) before each authorized
commit or PR. Preserve unrelated files in the working checkout.

The foundation full profile runs every required check declared by the manifest,
including source boundaries, typechecking, lint, measured foundation/tooling
coverage and audit-helper tests. The manifest owns the complete commands and
order; earlier governance evidence cannot replace this source-phase gate.

Run the complete profile for every PR, including drafts and documentation-only
changes, without changed-path or target-branch filters. Foundation tests do not
stand in for unpublished service, HTTP, database, authentication or storage tests.
Add relevant real behavior evidence as each owner is published.

CI displays each real suite separately and partitions the canonical full gate:

| Job              | Manifest profile | Required work                                                                     |
| ---------------- | ---------------- | --------------------------------------------------------------------------------- |
| Static checks    | `ci-quality`     | Snapshot, CI policy, actionlint, boundaries, types, lint, formatting and guidance |
| Dependency audit | `ci-audit`       | Locked dependency audit                                                           |
| Governance tests | `ci-governance`  | Measured foundation/tooling coverage and audit-helper tests                       |

Each check belongs to one CI job and runs once. The required `check` context only
aggregates these jobs: missing, failed, skipped or cancelled work fails the result.
It does not install dependencies or rerun tests. Local `full` validation runs
the complete canonical profile in its declared order. Published pure foundation
tests run within the coverage check; service, HTTP, browser and application-build
jobs are not available in this foundation publication.

The Sonar job waits for successful validation and consumes the governance job's
measured report directly, bound to its suite, source, workflow run and producing
attempt. An analysis-only rerun must use the successful producer's original
attempt; a new governance attempt produces a different immutable artifact.
Scanner execution and the provider's quality-gate result are separate evidence.
Missing configuration, failed audit requests, absent reports, stale source or
provider skips must remain visible.

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
