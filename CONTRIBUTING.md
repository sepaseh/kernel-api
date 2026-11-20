# Contributing

Use the existing checkout and preserve unrelated tracked, staged and untracked
work. Read the [assistant entry point](AGENTS.md) and the
[Git workflow](.agents/rules/git.md). Check which files are admitted in the
[publication policy](.github/bootstrap-policy.json).

Use [Development](docs/development.md) to set up the API locally and
[Source navigation](docs/source-navigation.md) to find the owning implementation,
tests and guides. Keep framework dependencies out of contracts, core modules
and ports. Include every dependency and test for a new owner. Follow the
[feature checklist](docs/feature-development.md) for API changes and update
the affected guide, contract examples or consumer handoff alongside the code.

## Pull requests

### Scope and PR planning

Verify the repository, current branch, status and intended base. Create or
reuse a focused `codex/<purpose>` branch. Keep changes to protected `main`
on a pull request.

Review the complete diff against the intended base. Aim for at most 80
changed-file entries. Count additions, deletions, renames and binaries,
with one entry per rename. Split independent changes and explain larger
cohesive changes.

File count is advisory. Exceeding 100 entries alone does not fail CI or
require recreating a PR. A merge remains subject to the review and protection
requirements below.

Use a Conventional Commit title and the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
Explain the problem, resulting behavior, checked snapshot and material
limitations. A stacked PR targets its verified predecessor and states that
dependency.

### Review and protection

Follow [branch protection](docs/branch-protection.md) and the
[Sonar and CodeRabbit preflight](docs/sonarqube.md#before-requesting-coderabbit).
Review must cover the exact current head and include the native CodeQL result.
Verify scanner execution, the actual provider quality gate and substantive
CodeRabbit review separately. A CodeRabbit progress status or ordinary approval
count does not prove that CodeRabbit approved that head.

Use the native approval count. A separate publisher or custom approval check is
unnecessary. Keep incomplete work in draft unless the owner explicitly requests
ready-for-review status. Verify actual current-head provider evidence before
any separately authorized merge. Preserve active requirements. Ready-for-review
status leaves CodeRabbit preflight and request authorization in force.

Full CI and CodeQL run for every PR base. Main-branch protection applies when
the PR targets `main`. After prerequisites are reviewed and merged, retarget
to `main` and obtain fresh current-head and base evidence before any
separately authorized merge.

## Checks

### Validation and authorization

Use the Node version in [.nvmrc](.nvmrc) and the locked root dependencies.
Start with the smallest relevant check in the
[validation manifest](.agents/validation.json). Keep all required checks
active. Report actual commands, results and unavailable evidence.

Get authorization for the particular action before staging, committing,
pushing, commenting remotely, requesting review or merging.

Before an authorized commit or PR, export the exact proposed inventory into an
owned temporary validation directory. Install its locked tooling dependencies
and run the complete `full` profile there. Use exports only for verification
and remove only owned fixtures after closing their processes. Validate partial
PRs against their actual file inventory. Keep failed checks visible and report
unavailable evidence as such. The full profile covers every required check in
the manifest, including source boundaries, type checking, lint, measured
published-source and tooling coverage and audit-helper tests. It applies to
every PR, including drafts and documentation changes.

Choose the [test suite](docs/testing.md) that exercises the changed behavior.
HTTP, database, authentication and storage changes require evidence from real
adapters using disposable synthetic fixtures. See the
[validation procedure](docs/validation.md) for the full gate and reporting.

## Documentation

Write maintained Markdown in English and organize it by reader task. Update
the owning guide when behavior, configuration, tests or workflows change. Use
the [documentation index](docs/README.md) to make guides discoverable. State
the prerequisites, actions, expected result and recovery where needed. Verify
commands against their source and use descriptive links to files and sections
in this repository. Use public synthetic examples.

Run `npm run check:guidance` for focused documentation checks.
