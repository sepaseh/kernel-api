# Kernel API assistant instructions

Read [.agents/README.md](.agents/README.md), [settings](.agents/settings.json),
[task navigation](docs/source-navigation.md) and the matching canonical rules
before changes. Work in the existing checkout and preserve unrelated local work,
private configuration, databases, uploads and credentials. Additional worktrees,
clones or implementation copies require prior explicit user authorization.

## Published scope

The publication inventory and validation manifest declare the current reviewed
source phase. Publish only the owned contracts, services, adapters, tests and
guides admitted there; preserve all other local source and private runtime state.
Each newly published owner requires its complete dependencies and actual tests.
`applicationReady` remains false; local source tests establish no production OTP
delivery, deployed integration or production readiness.

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

Every source-phase profile runs all ten required checks from the manifest, including
real source boundaries, typechecking, lint, measured published-source tests and
audit-helper tests. Run the full profile for drafts and documentation changes
too. Add the relevant real HTTP, database, authentication and storage tests as
their owners are published; pure foundation or governance tests cannot establish
those behaviors. Do not hide failed or missing checks.

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

Successive PRs may target their prerequisite branches. Full CI and the read-only
bootstrap file budget run for those PRs; privileged trusted guards target `main`
only. Their enforcement remains pending until the reviewed prerequisites are on
`main` and the PR is retargeted with fresh checks. Honor an explicit instruction
to publish ready for review while disclosing pending provider results; that
status does not authorize merging or waive any review prerequisite.

## Source boundaries

The API exclusively owns DB access, migrations, authentication and storage.
Preserve framework-free services and feature ports, concrete adapters, thin Hono
HTTP routes, manual composition and atomic transactions. Read the relevant
[backend](.agents/rules/backend.md), [data lifecycle](.agents/rules/data-lifecycle.md)
and [localization](.agents/rules/localization.md) rules for the published owners.
Wire definitions stay in pure feature-owned `src/contracts` modules without a
catch-all barrel. Application imports of `src/application/localization.ts` are
erased types; runtime catalogs and translation engines belong to infrastructure.
Business references must block hard deletion with a localized 409 conflict,
without partial effects. Soft deletion is prohibited.

Use disposable synthetic fixtures. Never read or copy real environments,
credentials, databases, buckets or uploads from another checkout. Keep
instructions, rules, skills, evaluation prompts and human documentation in
English. Configuration files do not prove that an assistant loaded instructions
or that any provider analysis actually ran.
