# Contributing to Kernel API

Publish the repository in focused PRs. The first publication contains only rules,
assistant guidance, repository configuration and the tools that verify them.
The [inventory](.github/bootstrap-policy.json) declares the exact proposed paths.
Preserve all unrelated local source and private runtime state.

## Scope and PR planning

Before opening a PR, aim for **80 or fewer changed-file entries** and split
independent changes when useful. Count additions, removals, renames and binaries;
a GitHub rename is one entry. Explain why a larger cohesive change belongs
together. File count is advisory: exceeding 100 files alone does not fail CI,
block merging or require deleting or recreating a PR.

Keep API source, migrations, catalogs, collections, deployment and release
workflows out of the governance PR. Introduce executable workflows together with
their owners and tests in later focused PRs; do not publish broken placeholders.

## Validation and authorization

Read [AGENTS.md](AGENTS.md) and the [Git rule](.agents/rules/git.md).
Do not stage, commit, push, comment remotely, request reviews or merge without
authorization for the particular action. Use the existing checkout and preserve
unrelated tracked and untracked files.

[.agents/validation.json](.agents/validation.json) owns every current check and
the complete `full` profile. Before an authorized commit or PR, export the exact
proposed inventory into an owned temporary validation directory, install its
locked tooling dependencies and run the full profile there. Such exports are
verification fixtures, never additional implementation checkouts. Remove only
owned fixtures after closing their processes.

Do not validate a partial PR against ambient unpublished API files, skip failures,
weaken checks or report unavailable evidence as a pass. Governance checks cover
snapshot boundaries, configuration, workflow security, audit, formatting,
documentation and measured governance tests. They do not validate the local API.

Before publishing application source, establish the complete application gate
for the precise source phase, including real relevant HTTP, database,
authentication and storage tests. Keep the complete gate required for drafts
and documentation changes once that application phase is published.

## Review and protection

Follow [branch protection](docs/branch-protection.md) and the
[Sonar/CodeRabbit preflight](docs/sonarqube.md#before-requesting-coderabbit).
Review must cover the exact current head and include the native CodeQL result.
Scanner success and the actual provider
quality gate are separate requirements. A CodeRabbit progress status or ordinary
approval count does not prove that CodeRabbit approved that head.

Use the native approval count; no separate publisher or custom approval check
is required. Keep incomplete work in draft unless the owner explicitly requests
ready-for-review status. That status does not establish merge readiness. Verify
the actual current-head provider evidence before any separately authorized merge;
do not weaken active requirements to unblock publication.

Use a Conventional Commit title and the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
Do not merge without separate authorization.
