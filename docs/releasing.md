# Manual release metadata

[English](releasing.md) · [فارسی](releasing.fa.md)

Use a reviewed change, verified checks and an explicitly authorized PR or merge.
The [release operations guide](release-operations.md) describes artifact handling,
compatibility and rollback; [branch protection](branch-protection.md) describes
the remote checks that must be verified rather than inferred from local files.

The [changelog](../CHANGELOG.md) records published release notes; version settings
alone do not establish a published release.

The release-please workflow and settings are intended to prepare release metadata
and PRs by manual dispatch; their presence does not establish that the workflow
has been configured or run. It is not intended to build or
publish production images, activate services or modify database state.
Use Conventional Commits for requested commits. Never commit or push merely to
complete a source copy. [Release operations](release-operations.md) owns artifact
approval, compatibility, checksums, activation and rollback; [branch protection](branch-protection.md)
describes remote policy that still requires explicit setup/verification.

The workflow prefers the repository secret `RELEASE_PLEASE_TOKEN` and falls back to
`GITHUB_TOKEN`. Configure a dedicated token with the required repository contents
and pull-request write access when repository policy does not permit GitHub Actions
to create pull requests; the fallback cannot create a release PR under that policy.
An authorized maintainer must configure the secret and verify the repository policy
and the actual workflow runs and required checks. Do not assume workflows were
triggered or passed merely because a release PR exists. Do not expose token values.

Release Please updates the English `CHANGELOG.md`; it does not automatically update
`CHANGELOG.fa.md`. Before merging a release PR, prepare and review the Persian
entry to match the generated English notes. Verify both files as part of the PR.

Local tests and checked-in templates do not prove a deployed release or production
OTP delivery. Never publish credentials, private state or test fixtures as release
artifacts.
