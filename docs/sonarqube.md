# SonarQube Cloud analysis

[English](sonarqube.md) · [فارسی](sonarqube.fa.md)

The [workflow](../.github/workflows/sonar.yml) uses CI-based analysis in the
`sepaseh` SonarQube Cloud organization on PRs, pushes to `main` and manual runs.
Import and bind the repository as a public Sonar project before analysis.

## Setup

1. Give the existing SonarQube Cloud app access through
   [GitHub installed applications](https://github.com/settings/installations).
2. [Import the repository](https://sonarcloud.io/projects/create) into `sepaseh`
   and select **With GitHub Actions**. Choose **Linux** for this workflow's
   `ubuntu-latest` runner, even when the local development machine uses Windows.
3. Disable **Automatic Analysis** in **Administration → Analysis Method**;
   automatic and CI-based analysis must not run together.
4. Generate a token in [My Account → Security](https://sonarcloud.io/account/security)
   and store it only as repository Actions secret **`SONAR_TOKEN`**. Never put its
   value in a commit, PR, log or chat. The token's display label, such as
   `kernel-github-actions`, is arbitrary; it is not the secret name or project key.
5. Set Actions variable **`SONAR_PROJECT_KEY`** to the actual imported project key.
   **`SONAR_HOST_URL`** defaults to `https://sonarcloud.io`. Do not manually add a
   second scanner workflow from the provider wizard.

The Actions secret stores the token value. `SONAR_PROJECT_KEY` identifies the
imported project (`sepaseh_kernel-api`); `SONAR_HOST_URL` identifies the service.
These are separate settings. Inspect secret names and timestamps when verifying
configuration, without reading or printing secret values.

An empty project or a configured token alone does not establish successful
analysis. Verify the actual GitHub run and the provider's PR analysis and
quality-gate result. An empty `main` analysis history does not itself prove that
PR analysis is blocked. Follow an actual provider error if initial branch
analysis is required; do not merge early merely to create a baseline.

## Before requesting CodeRabbit

Request or re-request CodeRabbit only after all of the following are verified for
the exact current PR head:

1. Every required non-CodeRabbit CI/protection check has passed, including build,
   end-to-end and visual checks whenever required. Missing, pending, queued,
   skipped, cancelled, stale, failed or unavailable checks block the request.
   The publication phase does not excuse a configured required job.
2. Sonar scanner execution succeeded and the actual Sonar provider quality gate
   passed for that revision. Read these as two separate results.
3. The complete applicable latest Sonar PR/branch report, across all result pages,
   contains **zero open or unresolved issues at every severity**, including
   existing issues. Inspect the full report rather than only new-code widgets,
   changed lines, selected issue types or quality-gate conditions. Verify the
   project, analysis revision and issue scope; an older or unavailable report
   does not establish readiness. Read the issue count even when the gate passes.

CodeRabbit's own check and approving review are excluded from this preflight to
avoid a circular dependency. Other required checks remain mandatory. A new commit
invalidates the evidence; repeat the full preflight before another request.

Fix issues legitimately. A written false-positive explanation alone does not
clear an issue. Any legitimate classification change in Sonar requires proper
explicit authorization and fresh evidence of zero open/unresolved issues. Do not
exclude code, suppress findings, weaken rules/gates, hide severities or waive
issues merely to request review or consume quota.

The repository's `.coderabbit.yaml` disables automatic and incremental reviews,
including drafts. Native review and automatic approval remain enabled; request
review manually only after this preflight passes. Within an authorized cycle,
respect provider quotas and keep at most one request in flight per head. Do not
send duplicate requests or enable automatic triggers to bypass this order. After
review fixes create a new commit, run the preflight again.
Before each new request, verify that at least one hour has elapsed since both
this repository's latest manual request and its latest substantive CodeRabbit
review, including recent PRs. Respect any later retry time reported by the provider.

## Current scope

During the [storage-local phase](bootstrap.md),
[sonar-project.properties](../sonar-project.properties) includes the published
`src` and `scripts` directories, classifies `.test.ts` and `.test.mjs` files as
tests and imports actual `coverage/lcov.info` produced in the same CI checkout.
This measures published application services, core modules, static catalogs,
configuration, translation/logging/lifecycle support, local filesystem storage and tooling.
Real local-storage tests use disposable filesystem fixtures. Fake-port coverage is not concrete HTTP, DB, authentication or MinIO evidence;
that coverage must be added when the runnable phase is introduced.

Duplication detection excludes only the ten explicit language data files under
`src/infrastructure/localization/catalogs/`: `ar.ts`, `de.ts`, `en.ts`, `es.ts`,
`fa.ts`, `fr.ts`, `it.ts`, `pt.ts`, `ru.ts` and `tr.ts`. Each repeats the same
message keys with genuine translated values. AST checks enforce flat literal
string data without executable logic or fallback spreads. The registry `index.ts`
and `src/contracts/locales.ts` retain duplication analysis. All catalog files
remain in source, rule and measured coverage analysis; no rule, source or coverage
exception is applied. Revisit the narrow duplication exception if executable
logic is introduced, and verify the actual provider analysis before reporting
success. See Sonar's
[duplication exclusion documentation](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/exclude-from-coverage-duplication).

Missing credentials or project settings fail with an explicit setup error;
scanner failures remain visible. `sonar.qualitygate.wait=false` does not wait for
the asynchronous provider decision in the scanner process. Scan execution and a
passing provider quality gate are separate evidence; both are required for merging.
Branch protection requires the observed **SonarCloud Code Analysis** from the
Sonar app alongside CI, the native CodeRabbit status and the ordinary
[review requirements](branch-protection.md).

Fork PRs do not run this credentialed workflow; read-only bootstrap/file-limit
checks still apply. Maintainers must review fork code before moving it onto an
authorized branch for credentialed analysis. Tokens are not copied from other
repositories and local tests do not contact SonarQube Cloud.

See the [official scanner](https://github.com/SonarSource/sonarqube-scan-action)
and [analysis-method documentation](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis).
