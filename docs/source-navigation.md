# Task navigation

Start with [AGENTS.md](../AGENTS.md). The machine-readable
[task map](../.agents/navigation.json) lists only published governance owners.

For rules and assistant workflows, read [.agents/README.md](../.agents/README.md),
[settings](../.agents/settings.json) and [guidance](../.agents/rules/guidance.md).
For branches, commits, PRs and reviews, use
[Git workflow](../.agents/rules/git.md), [branch protection](branch-protection.md)
and [Sonar guidance](sonarqube.md). The [CodeQL workflow](../.github/workflows/codeql.yml)
and policy regressions in [the governance tests](../scripts/check-governance.test.mjs)
own hosted JavaScript/TypeScript and GitHub Actions security scan configuration.
The [actionlint runner](../scripts/run-actionlint.mjs) and its [regressions](../scripts/run-actionlint.test.mjs)
validate the actual workflow files as part of Static checks.

Read actual owners and tests before making claims. Map entries, successful
configuration parsing and installed applications do not establish that an
assistant loaded instructions or that remote review ran.

API feature, contract, authentication, localization, storage and deployment task
owners will be added with the corresponding source phases. Do not register
unpublished paths as live task owners.
