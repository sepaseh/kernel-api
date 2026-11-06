# SonarQube Cloud and CodeRabbit

Use CI-based analysis for the public project in the `sepaseh` organization.
Bind the recreated GitHub repository to the actual Sonar project; prior
repository installation or analysis does not prove this binding.

## Setup and evidence

Give the SonarQube Cloud and CodeRabbit apps access to this repository.
Choose CI-based analysis and disable Sonar automatic analysis to avoid a second
independent scan. Configure `SONAR_TOKEN` as the repository Actions secret and
separately as a Dependabot secret when Dependabot analysis is needed.
Set `SONAR_PROJECT_KEY` to the actual imported key; `SONAR_HOST_URL` defaults
to `https://sonarcloud.io`. Inspect names only, never secret values.

The current source phase analyzes its published `src` and `scripts` and imports
`coverage/lcov.info` produced by the successful **check** job. **Unit tests**,
**API integration tests** and **Governance tests** each execute their own tests
once and publish measured LCOV, raw V8 coverage and provenance. Governance also
publishes the audit helper's separately measured coverage.

`check` requires every job to succeed, verifies the three suite artifacts using
their actual producer attempts, and computes the native coverage summary. It
retains the independent 80% line, branch and function gates for non-audit sources
and the audit helper. Its combined attestation at
`coverage/combined/ci-evidence.json` binds the measured report to the tested
commit and tree, PR head and base, workflow, producing attempt, and the identities
and hashes of all three input manifests.

Analysis downloads `coverage-combined-<run>-<attempt>` directly from that
successful check and verifies its identity and report bytes before installing
analysis dependencies. It imports the existing report without executing tests
or recomputing coverage. An analysis-only rerun uses the check producer's
original attempt. Do not reuse another head's report or attribute it to owners
outside the inventory or to deployed service behavior. The scanner sets the SCM
revision to the PR head or triggering commit while coverage remains bound to the
exact tested checkout and merge base.

Require both **SonarQube Cloud analysis** from GitHub Actions and the actual
**SonarCloud Code Analysis** provider gate from the verified Sonar application.
Confirm observed check names on the first real run; a missing or renamed result
is a setup blocker, not permission to remove a requirement. Scanner success,
project configuration and a green provider gate are distinct facts.

Fork PRs do not receive Sonar credentials. Review external code before placing it
on an authorized branch for credentialed analysis. Never expose a token through
a privileged checkout of fork code.

Full CI, CodeQL and scanner analysis can run on stacked PRs targeting prerequisite
branches. Main-branch protection applies when a PR targets `main`; use native
provider checks and the native approval count. After retargeting to `main`, require
fresh head/base evidence and actual provider results. A user-authorized ready-for-review
status with pending checks does not establish analysis, authorize merging or
relax the preflight below.

## Before requesting CodeRabbit

For every authorized review or re-review:

1. Verify the exact current PR head, repository and Sonar project.
2. Require success from every non-CodeRabbit required CI and protection result.
   Exclude only CodeRabbit's native check and approval, because those depend on
   the requested review.
   Missing, skipped, pending, failed or stale non-CodeRabbit results block it.
3. Verify scanner success and the actual provider quality gate separately.
4. Inspect every page of the complete applicable latest Sonar issue report.
   Require zero open or unresolved issues at every severity, including existing
   issues. Do not restrict the report to changed lines, new code or gate widgets.
5. Fix issues legitimately. Classification changes require explicit authority and
   fresh evidence; do not suppress rules, exclude source or weaken gates.
6. Respect at most one in-flight request per head. Wait at least one hour since
   both the latest manual request and substantive review in this repository,
   including recent PRs, and honor any later provider retry time.

A new commit invalidates all head-specific evidence. Automatic and incremental
CodeRabbit reviews remain disabled; request manually only after this preflight.
`allow_author_approval: false` prevents the author shortcut from supplying an
approval without its normal review. Use the native approval count; it does not
select a particular reviewer. Actual provider checks and reviews must still
be inspected; a progress result alone is insufficient.

See [branch protection](branch-protection.md) and
[validation](validation.md). Configuration does not prove a real remote scan,
quality-gate decision, content review or current-head approval.
