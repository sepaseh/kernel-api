# Governance validation

The [canonical manifest](../.agents/validation.json) owns commands and profiles.
Run `npm run validate -- full` against an isolated export of the exact
[publication inventory](../.github/bootstrap-policy.json) before each authorized
commit or PR. Preserve unrelated files in the working checkout.

The governance profile performs real snapshot, CI/policy, audit, formatting,
guidance and measured test checks. It does not invent passing API checks for
absent source. Before later application publication, restore the complete
application gate and validate the relevant real source and behavior.

CI displays each real suite separately and partitions the canonical full gate:

| Job              | Manifest profile | Required work                                            |
| ---------------- | ---------------- | -------------------------------------------------------- |
| Static checks    | `ci-quality`     | Snapshot, CI policy, actionlint, formatting and guidance |
| Dependency audit | `ci-audit`       | Locked dependency audit                                  |
| Governance tests | `ci-governance`  | Published governance tests and measured coverage         |

Each check belongs to one CI job and runs once. The required `check` context only
aggregates these jobs: missing, failed, skipped or cancelled work fails the result.
It does not install dependencies or rerun tests. Local `full` validation remains
the complete seven-check gate, in its canonical order. API unit, HTTP, browser and
application-build jobs are not available in this governance publication.

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
metadata and bytes through the same open file handle; new cache entries use
exclusive creation and never overwrite another writer. Downloads stop when the
stream exceeds the archive size limit. Failed cache writes close their handles
before removing partial files and preserve any cleanup failure.
This required check runs once in Static checks and once within each separately
requested local `full` gate; it does not add another CI job or suppress lint findings. Optional ShellCheck and
Pyflakes integrations are disabled so actionlint has the same scope on supported
Windows and Linux hosts.

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
Neither local configuration nor a local pass proves remote protection is active.

Use disposable owned fixtures. Report actual QA results in the current chat;
create a report only on explicit request under ignored `test-results/`.
