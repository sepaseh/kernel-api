# Pull requests

A pull request explains why a change is needed, what changed, and how to verify
it. Use the repository's pull-request conventions in `CONTRIBUTING.md`.

## Before creation

- Verify the intended base and [branch policy](branches.md); review the complete
  base-to-head diff for unrelated work instead of assuming a branch name exists.
- Target 80 or fewer GitHub changed-file entries when opening a PR, counting
  additions, deletions, renames and binaries. A rename counts as one GitHub entry.
  The hard CI limit remains 100, leaving 20 entries for review fixes.
- Run the declared phase's required gate on an isolated checkout/export of the
  exact proposed commit snapshot. Record the phase, commit/tree and actual checks.
  A full pass over local untracked source does not validate a partial published PR.
  Publishing runnable code still requires the full canonical application gate in
  `CONTRIBUTING.md`; bootstrap evidence cannot replace it.
- Use a Conventional Commit title; squash merging makes it the release commit.

## Body and linkage

- Explain the problem and chosen approach, not just changed files.
- Use `Closes #123` or `Fixes #123` only when the pull request fully resolves an issue.
- Use a contextual reference for partial work. Link the acceptance criteria and
  disclose rollout/compatibility needs for independently released HTTP consumers.
- Report only checks actually run and disclose limitations or residual risks.
- Include screenshots or recordings for visible UI changes.
- Keep the pull request as draft while required work or evidence is incomplete.

## Provider evidence and trusted checks

- Inspect the actual GitHub protection, required checks, approving reviews and
  conversation status. Do not change protection settings or add an approval
  publisher without explicit authorization.
- Inspect the actual latest-head provider results. A passing CodeRabbit progress
  status alone does not prove substantive review; disclose skips and rate limits
  and use the authorized manual-review cycle when needed.
- Inspect actual check details, review results and project binding for the latest
  PR head. Configuration files, installed apps and a successful status alone do
  not prove analysis or review ran; success may represent a skipped review.
- A manual CodeRabbit request or re-review is allowed only after the preflight
  below passes. A skipped review does not waive that prerequisite. Do not infer
  automatic review from YAML or enable an automatic trigger to bypass it.
- Treat Sonar scanner execution and its provider quality gate as separate results.
  Import genuinely measured LCOV from the same checkout and describe its actual
  source scope. Do not attribute governance-script coverage to unpublished runtime
  code. For setup/status checks, inspect secret names only, never token values.
- Verify each repository independently; working integration in another repository
  does not establish this repository's activation or successful execution.
- A `pull_request_target` guard must execute only trusted default-branch code,
  pinned to the immutable workflow commit with `github.workflow_sha`. Never execute
  unreviewed PR head/base code in that context; keep token permissions minimal.

## Before requesting CodeRabbit

Apply this preflight before every CodeRabbit request or re-review, including
`@coderabbitai review`. It does not prevent reading existing reviews or inspecting
code locally. Authorization to create a PR is not proof that this preflight passed.

1. Record the exact current PR head and verify the intended repository, branch and
   Sonar project. All evidence below must belong to that head. A new commit
   invalidates the preflight; repeat it before another request.
2. Require success from every required non-CodeRabbit check in the canonical
   validation/CI policy and branch protection. Include protected build, end-to-end
   and visual jobs whenever required. Exclude only CodeRabbit's own status and
   approving review from this prerequisite to avoid a circular dependency. Missing,
   pending, queued, skipped, cancelled, stale, failed or unavailable evidence blocks
   the request; a phase label cannot excuse a configured required job.
3. Verify successful Sonar scanner execution and the actual provider quality-gate
   result separately for that revision. A successful scanner job or a green gate
   alone is insufficient.
4. Inspect the complete applicable latest Sonar PR/branch issue report, including
   all result pages. It must contain **zero open or unresolved issues at every
   severity**. Include existing and new issues; do not restrict the report to new
   code, changed lines, issue types, severity filters or quality-gate conditions.
   Missing or stale reports block the request even when CI and the gate are green.
5. Fix remaining issues legitimately. A documented false positive alone does not
   satisfy zero issues. A classification change in Sonar requires proper explicit
   authorization and fresh evidence that no issue remains open/unresolved. Do not
   exclude code, suppress findings, weaken rules/gates, hide severities or waive
   issues merely to qualify for review or spend quota.
6. Only after every prerequisite passes, use an authorized review request. Respect
   provider quotas and allow at most one in-flight request per head. Do not send
   duplicate requests, force automatic triggers or work around a rate limit. After
   review fixes create another commit, restart the complete preflight.
   Wait at least one hour since both the latest manual request and the latest
   substantive CodeRabbit review in this repository; honor any later retry time.

See [validation](../../docs/validation.md),
[test reliability](../../docs/test-reliability.md),
[Sonar guidance](../../docs/sonarqube.md) and [safety](safety.md).

Do not create, update, mark ready, merge, or close a pull request without
explicit authorization for that remote action.
