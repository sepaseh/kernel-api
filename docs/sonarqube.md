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

## Current scope

During [governance bootstrap](bootstrap.md),
[sonar-project.properties](../sonar-project.properties) includes the published
`scripts` directory, classifies `.test.mjs` files as tests and imports actual
`coverage/lcov.info` produced in the same CI checkout. This is governance-script
coverage, not coverage of an unpublished API. Expand source and application
coverage explicitly when the runnable phase is introduced.

Missing credentials or project settings fail with an explicit setup error;
scanner failures remain visible. `sonar.qualitygate.wait=false` does not wait for
the asynchronous provider decision in the scanner process. Scan execution and a
passing provider quality gate are separate evidence; both are required for merging.
Branch protection requires the observed **SonarCloud Code Analysis** from the
Sonar app alongside CI and the [independent review gate](review-gate.md).

Fork PRs do not run this credentialed workflow; read-only bootstrap/file-limit
checks still apply. Maintainers must review fork code before moving it onto an
authorized branch for credentialed analysis. Tokens are not copied from other
repositories and local tests do not contact SonarQube Cloud.

See the [official scanner](https://github.com/SonarSource/sonarqube-scan-action)
and [analysis-method documentation](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis).
