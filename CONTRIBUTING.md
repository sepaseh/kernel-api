# Contributing to Kernel API

Publish the repository in focused PRs. The inventory and manifest declare the
current reviewed source phase and exact paths. Preserve unrelated local source
and private runtime state. A phase name, configuration file or successful unit
test does not establish unpublished adapter or deployed-service behavior.

## Scope and PR planning

Before opening a PR, aim for **80 or fewer changed-file entries** and split
independent changes when useful. Count additions, removals, renames and binaries;
a GitHub rename is one entry. Explain why a larger cohesive change belongs
together. File count is advisory: exceeding 100 files alone does not fail CI,
block merging or require deleting or recreating a PR.

Keep framework dependencies out of contracts, core modules and ports.
Publish application services, catalogs, adapters, migrations, HTTP, collections
and deployment assets in focused owner groups.
Introduce each owner with its necessary dependencies and tests; do not publish
unused interfaces or broken placeholders.

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
weaken checks or report unavailable evidence as a pass. The full profile runs
every required check in the current manifest, including real source boundaries,
typechecking, lint, measured published-source and tooling coverage and audit-helper tests.
It applies to every PR, including drafts and documentation-only changes.

Tests must cover each published owner. Introduce real relevant HTTP, database,
authentication and storage tests with those later owners; pure foundation and
governance tests do not prove their behavior. Earlier governance evidence cannot
replace the current source-phase gate.

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
do not weaken active requirements to unblock publication. A ready-for-review
request does not authorize a CodeRabbit request before its preflight passes.

For a stack, each PR targets its immediate prerequisite so its diff contains
only that slice. Full CI and CodeQL run for every PR base. Main-branch protection
applies when the PR targets `main`. After prerequisites are reviewed and merged,
retarget to `main` and obtain fresh current-head/base evidence before any
separately authorized merge.

Use a Conventional Commit title and the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
Do not merge without separate authorization.
