# Main-branch protection

Repository configuration files do not activate GitHub protection by themselves.
An authorized administrator applies the [main ruleset](../.github/rulesets/main.json)
and verifies the live readback. Keep required contexts bound to their actual
provider applications; change remote requirements only with explicit authorization.

## Required controls

Require a PR, at least one approving review, stale-approval dismissal, approval of
the most recent push, resolved conversations, an up-to-date branch and linear
history. Disallow force pushes, deletion and administrative bypass. Use squash
merges; do not enable automatic merging as part of this setup.

Require the stable `check` aggregate over Static checks, Dependency audit and
Governance tests, the native CodeQL security check, successful Sonar scanner execution
and the actual Sonar provider
quality gate and the native CodeRabbit result. Use the native approval count;
no separate publisher or custom approval check is required. A PR author cannot
supply their own approving review. CodeRabbit disables the author-triggered
approval shortcut.

Inspect actual evidence for the current PR head. A successful CodeRabbit status
can represent a skipped or rate-limited review, and the native approval count
does not select a particular reviewer. Missing, pending, failed, skipped or stale
provider evidence cannot be reported as completed content review or approval.
Keep incomplete work in draft unless the owner requests ready-for-review status;
that status does not establish merge readiness. Do not remove active requirements
to hide failures or unblock publication.

## Published phase and trust

The governance phase keeps `applicationReady: false`. Require its actual CI, CodeQL,
scanner, provider quality gate and CodeRabbit results, without claiming unpublished
API checks. Before application publication, restore its complete canonical gate
and require the real source, HTTP, database, authentication and storage checks.

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
