# Pull requests

A pull request explains why a change is needed, what changed, and how to verify
it. Use the repository's pull-request conventions in `CONTRIBUTING.md`.

## Before creation

- Verify the intended base from the request or repository metadata and review the
  complete base-to-head diff for unrelated work; do not assume a base branch.
- Before opening a PR, aim for 80 or fewer GitHub changed-file entries initially.
  Split independent changes when useful and explain why a larger cohesive change
  belongs together. Count additions, deletions, renames and binaries; a rename
  counts as one GitHub entry. File count is advisory: exceeding 100 files alone
  must not fail CI or require deleting and recreating a PR.
- Run the declared phase's required gate on an isolated checkout/export of the
  exact proposed commit snapshot. Record the phase, commit/tree and actual checks.
  A full pass over local untracked source does not validate a partial published PR.
  Publishing runnable code still requires the full canonical application gate in
  `CONTRIBUTING.md`; bootstrap evidence cannot replace it.
- Use a Conventional Commit title; squash merging makes it the release commit.

## Body and linkage

- Explain the problem and chosen approach, not just changed files.
- Use `Closes #123` or `Fixes #123` only when the pull request fully resolves an issue.
- Use `Refs #123` or `Related to #123` when linkage is contextual or partial.
- Report only checks actually run and disclose limitations or residual risks.
- Include screenshots or recordings for visible UI changes.
- Complete required local work before authorized publication and honor the user's
  existing Ready for review or draft preference. A remote CI run may still be
  pending after creation; disclose that status and never claim approval from it.

## Provider evidence and required checks

- Merging requires the ordinary native CI, CodeQL, CodeRabbit and SonarCloud checks,
  at least one approving review and resolved review conversations. Apply
  protection to administrators, dismiss stale approvals and require an up-to-date
  branch. Use the native approval count; no separate publisher or custom approval
  check is required. See [branch protection](../../docs/branch-protection.md).
- Verify actual provider evidence for the current PR head. Missing, pending,
  failed, skipped or quota-limited review/analysis must not be reported as a
  completed review or passing analysis. Do not remove checks to hide a failure.
- Match protection to the declared published phase, changing remote requirements
  only with explicit authorization. A foundation with `applicationReady: false`
  requires its actual phase CI, CodeQL, scanner, Sonar quality gate and CodeRabbit; it
  must not claim unpublished application checks. Before runnable API publication,
  restore the complete application gate and complete the relevant real source,
  HTTP, database, authentication and storage validation. Observe required jobs
  pass and expand protection with the complete canonical application gate.
- Inspect actual check details, review results and project binding for the latest
  PR head. Configuration files, installed apps and a successful status alone do
  not prove analysis or review ran; success may represent a skipped review.
- Before any CodeRabbit request, complete the preflight below. A skipped automatic
  review does not authorize an immediate manual request.
- Treat Sonar scanner execution and its provider quality gate as separate results.
  Import genuinely measured LCOV from the same checkout and describe its actual
  source scope. Do not attribute governance-script coverage to unpublished runtime
  code. For setup/status checks, inspect secret names only, never token values.
- Verify the proposed source tree directly; unrelated integration evidence does
  not establish this application's activation or successful execution.
- A `pull_request_target` guard must execute only trusted default-branch code,
  pinned to the immutable workflow commit with `github.workflow_sha`. Never execute
  unreviewed PR head/base code in that context; keep token permissions minimal.

## CodeRabbit request preflight

- Bind the evidence to the latest published PR head and its applicable Sonar
  project/PR or analyzed branch. Any new commit invalidates the preflight.
- Every required non-CodeRabbit check must have passed, including protected
  build, end-to-end and visual checks when required, the Sonar scanner job and
  the actual Sonar quality gate. Exclude CodeRabbit's own check/approval from this
  prerequisite to avoid a cycle; they remain merge requirements.
- Verify zero open or unresolved issues in the complete applicable latest Sonar
  report, across all severities and existing/new code. Inspect every page; a
  passing quality gate, zero new issues or an empty/unanalysed project is not
  sufficient evidence. Record the revision, analysis/report link and issue count.
- Missing, pending, skipped, failed or stale checks, or missing zero-issue evidence,
  block the request. A documented false positive still marked open in Sonar also
  blocks it. Clear it through a properly authorized provider classification or a
  real fix followed by fresh analysis, never exclusions, suppressions or weaker
  checks used to bypass this prerequisite.
- Only after this preflight passes and remote-request authorization exists, request
  one manual review by posting only `@coderabbitai review`. Do not duplicate an
  in-flight request for the same head. Wait at least one hour after the last
  CodeRabbit review request and latest substantive review in this repository;
  respect the provider's actual allowance and any later retry time.

See [validation](../../docs/validation.md),
[testing](../../docs/testing.md),
[Sonar guidance](../../docs/sonarqube.md) and [safety](safety.md).

Post standalone PR comments only with prior explicit user authorization.
Authorization to fix, commit, push or reply to review threads does not authorize
a standalone comment.

Do not create, update, mark ready, merge or close a pull request without explicit
authorization covering that action. Honor authorization and preferences already
provided in the conversation; do not introduce another approval step for the same
authorized action. A request to publish a PR includes the necessary branch push.
