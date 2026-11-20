# Verify branch protection

Use this guide to verify live branch protection and the evidence needed to merge
a pull request. Confirm the repository and actual PR base.

Repository configuration files do not activate GitHub protection by themselves.
An authorized administrator applies the [main ruleset](../.github/rulesets/main.json)
and verifies the live readback. Keep required contexts bound to their actual
provider applications; change remote requirements only with explicit authorization.

## Required controls

Require an approving review, dismiss stale approvals, resolve conversations,
require the branch to be up to date and enforce linear history. Block force
pushes, branch deletion and administrative bypass.
Require a PR and approval of the most recent push. Use squash merges and leave
automatic merging disabled during this setup.

Require all five status contexts from the [main ruleset](../.github/rulesets/main.json).

| Context                    | Evidence                                                       |
| -------------------------- | -------------------------------------------------------------- |
| `check`                    | All five CI jobs and combined coverage pass.                   |
| `CodeQL`                   | The native CodeQL security result passes.                      |
| `SonarQube Cloud analysis` | The GitHub Actions scanner job succeeds.                       |
| `SonarCloud Code Analysis` | The Sonar provider reports a passing quality gate.             |
| `CodeRabbit`               | Check the native status and verify the review for the PR head. |

The [CI job breakdown](validation.md#continuous-integration) lists the five jobs
under `check`. Use the native approval count. Count approvals from eligible
reviewers. CodeRabbit disables the author's approval shortcut.

Inspect actual evidence for the current PR head. A successful CodeRabbit status
can represent a skipped or rate-limited review, and the native approval count
does not select a particular reviewer. Missing, pending, failed, skipped or stale
provider evidence cannot be reported as completed content review or approval.
Keep incomplete work in draft unless the owner requests ready-for-review status;
that status does not establish merge readiness. Do not remove active requirements
to hide failures or unblock publication.

## Published phase and trust

The `local-runtime` phase keeps `applicationReady: false`. Require the
complete canonical CI profile for the published HTTP, database, authentication,
storage and operations owners, along with CodeQL, the Sonar scanner and quality
gate, and CodeRabbit. Those checks do not establish production readiness.

The source ruleset binds the native `CodeQL` context to the CodeQL application
(`57789`). The Actions job
`Analyze JavaScript, TypeScript and GitHub Actions` is separate from that provider
result. Neither local workflow validation nor source configuration
proves hosted analysis ran or that remote protection was changed.

Every external action must use an immutable commit. Any future privileged
`pull_request_target` guard must execute only trusted default-branch code pinned
to `github.workflow_sha`, with minimal permissions and no persisted checkout
credentials. Never execute unreviewed PR head or base code with write credentials.
An Actions-authored context identifies its app, not a particular workflow.
Repository writers and administrators remain trusted.

PR file count is advisory [pre-PR planning](../CONTRIBUTING.md#scope-and-pr-planning),
not a required check or merge condition. Exceeding 100 files alone never fails
CI or requires deleting or recreating a PR.

Follow the [CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit).
