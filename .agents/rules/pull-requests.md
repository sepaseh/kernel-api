# Pull requests

Use the [contribution guide](../../CONTRIBUTING.md) and
[pull request template](../../.github/PULL_REQUEST_TEMPLATE.md).

## Before creation

- Verify the intended base from the request or repository metadata. Review the
  complete base-to-head diff for unrelated work.
- Count additions, deletions, renames and binaries. Count one entry per rename.
- Aim for 80 or fewer GitHub changed-file entries initially. Split independent
  changes when useful and explain why a larger cohesive change belongs together.
  File count is advisory. Exceeding 100 entries alone must not fail CI or require
  deleting and recreating a PR.
- Follow the [validation procedure](../skills/validate-change/SKILL.md) for the
  exact proposed inventory, including drafts and documentation changes. Include
  the relevant real source tests for each newly published owner.
- Use a [Conventional Commit title](commits.md#commit-message). Squash merging
  makes it the release commit.

## Body and linkage

- Explain the problem, chosen approach and resulting behavior.
- Use `Closes #123` or `Fixes #123` only when the pull request fully resolves an issue.
- Use `Refs #123` or `Related to #123` when linkage is contextual or partial.
- Report only checks actually run and disclose limitations or residual risks.
- Include screenshots or recordings for visible UI changes.
- Record the declared phase, source commit and tree, and unpublished capabilities.

## Publish a pull request

Complete required local verification before [authorized publication](git.md#authorization).
An explicit request to publish a PR includes the necessary branch push.
Keep incomplete work in draft unless the user requests ready-for-review status.
Honor that request after required local work is complete and disclose any pending
provider results. Merging requires separate authorization and verified review
prerequisites.

## Provider evidence and required checks

- Match the checks to the [published phase and inventory](../../.github/bootstrap-policy.json).
  Apply the [required branch protection controls](../../docs/branch-protection.md#required-controls)
  to PRs targeting `main`. CI and CodeQL run for every PR base. When a
  prerequisite PR merges, retarget its dependent PR and obtain fresh checks for
  the current head and base. See the [workflow trust rules](../../docs/branch-protection.md#published-phase-and-trust)
  for privileged Actions workflows.
- Inspect actual check details, project binding and substantive review results
  for the current PR head. Call out missing, pending, failed, skipped, stale or
  quota-limited evidence. A successful status can represent a skipped review.
  Verify substantive review and approval in the provider's review records.
  Skipped and conversational replies never count as completed reviews.
- Follow [Sonar setup and evidence](../../docs/sonarqube.md#setup-and-evidence)
  for the separate scanner and provider quality gate and LCOV from the same
  checkout. Attribute coverage to the measured source scope. Follow
  [secret handling](safety.md#secrets-and-local-state) when checking setup.
- Report test scope for the admitted owners. `applicationReady` remains false.
  Application activation requires authorization and genuine current-revision
  evidence. Verify the proposed tree and its own test results.

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
  in-flight request for the same head. Wait at least one hour since both the
  latest manual request and the latest substantive review in this repository.
  Respect the provider's actual allowance and any later retry time.
- Keep automatic and incremental CodeRabbit reviews disabled. Apply the full
  preflight after any skipped review.
