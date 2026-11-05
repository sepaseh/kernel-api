# Manual release metadata

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

An authorized maintainer configures `RELEASE_PLEASE_TOKEN` with a
fine-grained personal access token limited to this repository, with contents
and pull-request write access for the release operation. Set an expiration
consistent with the repository owner's policy and replace the secret before
the token expires.
The workflow fails before calling Release Please if the secret is missing.
Using a dedicated token lets release PR updates trigger normal pull-request
CI and CodeQL without the workflow approval required for PRs created or
updated using `GITHUB_TOKEN`. Verify all required checks for the exact release
PR head. Keep token values private.

Release Please updates `CHANGELOG.md`. The Node release strategy updates the
package and lockfile, but its generated changelog bullets do not match the required
formatter. On the release PR branch, an authorized maintainer should run
`npx prettier --write CHANGELOG.md` and run `npm run format:check`. Run the complete
`npm run validate -- full` gate on the exact proposed tree before an authorized
commit or push of the formatted changelog. Repeat verification after Release
Please updates the PR; a formatter check does not replace the full gate.

Merging the release PR alone does not create the tag or GitHub release. After
merging, an authorized maintainer must dispatch the Release workflow again on
`main` and verify that both the tag and GitHub release were created.

Local tests and checked-in templates do not prove a deployed release or production
OTP delivery. Never publish credentials, private state or test fixtures as release
artifacts.
