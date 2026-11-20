# Assistant entry point

Read the [assistant guidance index](.agents/README.md) and
[Contributing](CONTRIBUTING.md) before making changes. Use the
[publication policy](.github/bootstrap-policy.json) to confirm the current phase
and admitted files. Read the applicable rules, source owners and tests. Verify
behavior against the current source and actual checks.

## Scope and safety

Use the existing checkout and preserve unrelated tracked, staged and untracked
work. Get explicit user authorization for any additional worktree, clone or
copied implementation checkout, including when delegating.
[Working-checkout rules](.agents/rules/branches.md#working-checkout)

Use disposable synthetic fixtures. Keep real environments, credentials, keys,
databases, uploads and browser state out of fixtures. Follow the
[safety rules](.agents/rules/safety.md#secrets-and-local-state) for public examples,
private state and authorized access.

Keep real environments, credentials, databases, buckets and uploads in their
own checkout. Do not read or copy them from another checkout. Use [settings](.agents/settings.json) and
[source navigation](docs/source-navigation.md) to find the matching rules,
source and tests.

## Published scope

Publish only the intended, authorized scope within the publication inventory.
Include the complete dependencies and
[tests at the owning boundary](.agents/rules/testing.md#choose-checks)
for each new owner. The current phase is `local-runtime` and `applicationReady`
is `false`. Production OTP delivery, deployed integrations and production
readiness require their own evidence.

## Git and review

Use a verified feature branch and PR for changes to protected `main`.
Honor existing authorization for the same action and scope. Follow the
[Git workflow](.agents/rules/git.md) and
[remote action boundaries](.agents/rules/safety.md#external-systems).
Review the complete diff against the intended base before publication. Follow
the [PR scope rules](.agents/rules/pull-requests.md#before-creation) and the
[review workflow](.agents/skills/review-pr/SKILL.md).

Staging, committing, pushing, remote comments and reviews, merging and remote
metadata changes require explicit authorization for the applicable action.
Keep force pushes and required-check bypasses prohibited.
Apply [branch protection](docs/branch-protection.md#required-controls) to PRs
targeting `main`. Verify
[current-head provider evidence](.agents/rules/pull-requests.md#provider-evidence-and-required-checks)
for every PR, including after retargeting. Follow the
[publication rules](.agents/rules/pull-requests.md#publish-a-pull-request) for
draft and ready-for-review status. Merging requires separate authorization and
verified review prerequisites.

Apply the [CodeRabbit preflight](.agents/rules/pull-requests.md#coderabbit-request-preflight)
to the exact current head before every authorized request or re-review. Keep
automatic reviews disabled.

## Verification and documentation

Start with a focused check from the [validation manifest](.agents/validation.json).
Preserve required checks, assertions, type safety, lint and security controls.
Report actual results, failures and unavailable evidence. Follow the
[validation workflow](.agents/skills/validate-change/SKILL.md).

Keep maintained documentation and assistant instructions in English, current
and organized by reader task. Use the [documentation index](docs/README.md)
and the [documentation rules](.agents/rules/guidance.md).

Run the complete `full` profile on an isolated export of the exact proposed
inventory before an authorized commit or PR, including drafts and documentation
changes. Keep rules, skills and evaluation prompts in English. Report actual
outcomes in chat using the
[evidence and QA reporting rules](.agents/rules/guidance.md#verify-evidence-and-results).

## Source boundaries

The API owns database access, migrations, authentication and storage. Keep
services framework-free, routes thin and adapter transactions atomic. Use
feature ports, concrete adapters and manual composition. Keep wire definitions
in pure feature-owned `src/contracts` modules. Follow the
[backend](.agents/rules/backend.md#ownership-and-dependency-direction),
[import](.agents/rules/imports.md) and
[localization](.agents/rules/localization.md#message-ownership) rules.

Business references block hard deletion with a localized HTTP 409 and no partial
effects. Soft deletion is prohibited. Follow the
[data lifecycle rules](.agents/rules/data-lifecycle.md).
