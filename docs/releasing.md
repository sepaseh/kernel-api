# Publish release metadata

The manually dispatched [Release workflow](../.github/workflows/release.yml)
runs Release Please on `main`. It manages release PRs, tags and GitHub Releases.
Use the [release operations guide](release-operations.md) for artifact handling,
deployment and rollback.

The [changelog](../CHANGELOG.md) records published release notes.
Verify the tag and GitHub release in the repository. A changelog entry or
version setting alone does not establish a published release.

## Configure the release token

An authorized maintainer configures `RELEASE_PLEASE_TOKEN` with a
fine-grained personal access token limited to this repository, with contents
and pull-request write access for the release operation. Set an expiration
consistent with the repository owner's policy and replace the secret before
the token expires.
The workflow fails before calling Release Please if the secret is missing.
Using a dedicated token lets release PR updates trigger normal pull-request
CI and CodeQL without the workflow approval required for PRs created or
updated using `GITHUB_TOKEN`. Keep the token value private.

## Prepare and publish the release

1. Use Conventional Commits for changes included in the release. Dispatch
   **Release** on `main` to create or update the release PR. The
   [Node release strategy](../release-please-config.json) updates the changelog,
   package manifest and lockfile.
2. On the release PR branch, install locked tooling with `npm ci`, format the
   generated changelog with `npm exec -- prettier --write CHANGELOG.md`, and
   run `npm run format:check`. Validate the exact proposed tree with the
   [full profile](validation.md) before an authorized commit or push. Repeat
   verification after Release Please changes the PR.
3. Verify the [required checks and review](branch-protection.md) for the exact
   release PR head before an authorized merge.
4. After merging, dispatch **Release** again on `main`. Verify the expected tag
   and GitHub Release both exist and record their source revision.

Local tests and checked-in templates do not prove a deployed release or production
OTP delivery. Never publish credentials, private state or test fixtures as release
artifacts.
