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

The first publication analyzes its published governance scripts and imports real
`coverage/lcov.info` measured by that CI run. The provenance manifest binds
coverage to the source, workflow and producing attempt. Do not reuse another
head's report or attribute this coverage to unpublished API source.

Require both **SonarQube Cloud analysis** from GitHub Actions and the actual
**SonarCloud Code Analysis** provider gate from the verified Sonar application.
Confirm observed check names on the first real run; a missing or renamed result
is a setup blocker, not permission to remove a requirement. Scanner success,
project configuration and a green provider gate are distinct facts.

Fork PRs do not receive Sonar credentials. Review external code before placing it
on an authorized branch for credentialed analysis. Never expose a token through
a privileged checkout of fork code.

## Before requesting CodeRabbit

For every authorized review or re-review:

1. Verify the exact current PR head, repository and Sonar project.
2. Require success from every non-CodeRabbit required CI and protection result.
   Exclude only the native CodeRabbit result, approving review and derived
   CodeRabbit approval guard, because those depend on the requested review.
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
approval without its normal review. Actual provider checks and reviews must still
be inspected; a progress result alone is insufficient.

See [branch protection](branch-protection.md) and
[validation](validation.md). Configuration does not prove a real remote scan,
quality-gate decision, content review or current-head approval.
