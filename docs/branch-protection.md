# Main-branch protection

Repository configuration files do not activate GitHub protection by themselves.
An authorized administrator applies the reviewed ruleset and verifies the live
readback. Keep required contexts bound to their actual provider applications.

## Required controls

Require a PR, at least one approving review, stale-approval dismissal, approval of
the most recent push, resolved conversations, an up-to-date branch and linear
history. Disallow force pushes, deletion and administrative bypass. Use squash
merges; do not enable automatic merging as part of this setup.

Require full CI, the file-budget checks, successful Sonar scanner execution and
the actual Sonar provider quality gate. Require the native CodeRabbit result
and the separate current-head CodeRabbit approval guard once its trusted
default-branch implementation is available.

An ordinary approval count accepts other eligible reviewers and therefore does
not identify CodeRabbit. The guard must inspect the exact verified bot identity,
latest review and native provider check on the current head, rejecting missing,
stale, dismissed, skipped, neutral or failed evidence.

## First-PR bootstrap

A README-only default branch does not contain its own trusted
`pull_request_target` or `workflow_run` evaluator. PR1 cannot establish those
controls on itself. Its read-only bootstrap checks are useful evidence but do
not establish trusted default-branch enforcement.

The [bootstrap ruleset](../.github/rulesets/bootstrap.json) requires native CI,
bootstrap file budgeting, scanner, Sonar gate, CodeRabbit and an approving review.
Before any separately authorized first merge, verify the actual current-head
CodeRabbit approval and every provider result manually. Keep incomplete work in
draft. Do not remove an active requirement merely to unblock bootstrap.

After the reviewed guard is on the default branch, apply the
[complete main ruleset](../.github/rulesets/main.json), retaining the bootstrap
requirements and adding the trusted file-limit and CodeRabbit approval contexts.
Verify real failure cases before treating those new controls as established.

## Trust boundary

The evaluator runs only trusted immutable default-branch code with write
credentials; review-event relays have no permissions or checkout. It never
requests a review. The bot identity and literal completed-success provider result
block ordinary skips; they do not prove every file received content review.

Trusted target workflows apply to PRs targeting `main`. Publish successive PRs
into `main` after their prerequisites are reviewed and merged. Ordinary CI and
the read-only bootstrap file budget still run for PRs with other targets; do not
claim those establish the same trusted target enforcement.

An Actions-authored required context is bound to the GitHub Actions app, not one
specific workflow. Repository writers and administrators must remain trusted.
Stricter workflow-specific enforcement requires organization-level required
workflows or a separately authorized trusted publisher. Do not claim that an
ordinary personal-repository context provides that stronger guarantee.

Follow the [CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit).
