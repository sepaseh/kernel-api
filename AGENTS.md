# Kernel API assistant instructions

Read [.agents/README.md](.agents/README.md), [settings](.agents/settings.json),
[task navigation](docs/source-navigation.md) and the matching canonical rules
before changes. Work in the existing checkout and preserve unrelated local work,
private configuration, databases, uploads and credentials. Additional worktrees,
clones or implementation copies require prior explicit user authorization.

## Published scope

The first publication is **governance only**: assistant instructions, Git and
review policy, configuration and the small tools that enforce those policies.
The publication inventory is [.github/bootstrap-policy.json](.github/bootstrap-policy.json).
Local API source may exist outside that inventory; do not stage it in this PR.
No API, database, storage, authentication or deployment readiness is established.

Keep initial PRs at **80 or fewer changed files**, reserving 20 for review fixes.
The hard maximum is **100** including additions, deletions, renames and binaries.
Publish later work in focused dependent PRs; do not upload the entire local tree.

## Authorization and verification

Do not stage, commit, push, publish remote comments or reviews, merge, or change
remote metadata without authorization for that action. A request to prepare a
commit is not authorization to create it. Preserve authorization already given.
Read [Git workflow](.agents/rules/git.md), [branches](.agents/rules/branches.md)
and [safety](.agents/rules/safety.md). Never force-push or bypass required checks.

[.agents/validation.json](.agents/validation.json) owns commands and profiles.
Run its complete `full` profile on an isolated export of the exact proposed
inventory before an authorized commit or PR. Report actual outcomes in chat.
Create QA reports only on explicit request under ignored `test-results/`.
Never claim that checking an ambient working tree validates a partial PR.

The governance profile validates its own rules, workflow security, package audit,
formatting, documentation and measured governance tests. It does not run API
tests. Before publishing application source, restore all ten full application
checks and complete source, HTTP, database, authentication and storage validation.
Do not replace those checks with governance evidence or hide missing tests.

## Review and main-branch protection

Use ordinary GitHub, CodeRabbit and SonarQube Cloud integrations. Require CI,
scanner execution, the actual Sonar provider quality gate, an approving review
and resolved conversations. Enforce rules for administrators, dismiss stale
approvals, require the latest push to be approved, and prevent force pushes and
deletion. Read [branch protection](docs/branch-protection.md) for bootstrap limits
and the separate current-head CodeRabbit approval guard.

Before every authorized CodeRabbit request or re-review, enforce the
[preflight](.agents/rules/pull-requests.md#before-requesting-coderabbit): all
non-CodeRabbit required checks, scanner and actual gate must pass for the exact
head, with zero open or unresolved Sonar issues at every severity. A new commit
invalidates that evidence. Exclude only CodeRabbit's own native and approval
results to avoid a cycle. Respect provider quotas, one in-flight request per head,
and at least one hour since both the latest manual request and substantive review.
Never enable automatic reviews to bypass the order.

## Future API changes

The API exclusively owns DB access, migrations, authentication and storage.
Preserve framework-free services and feature ports, concrete adapters, thin Hono
HTTP routes, manual composition and atomic transactions. Read the relevant
[backend](.agents/rules/backend.md), [data lifecycle](.agents/rules/data-lifecycle.md)
and [localization](.agents/rules/localization.md) rules before future source work.
Business references must block hard deletion with a localized 409 conflict,
without partial effects. Soft deletion is prohibited.

Use disposable synthetic fixtures. Never read or copy real environments,
credentials, databases, buckets or uploads from another checkout. Keep
instructions, rules, skills, evaluation prompts and human documentation in
English. Configuration files do not prove that an assistant loaded instructions
or that any provider analysis actually ran.
