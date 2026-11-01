# Task navigation

Start with [AGENTS.md](../AGENTS.md). The machine-readable
[task map](../.agents/navigation.json) lists the published owners and their tests.

For rules and assistant workflows, read [.agents/README.md](../.agents/README.md),
[settings](../.agents/settings.json) and [guidance](../.agents/rules/guidance.md).
For branches, commits, PRs and reviews, use
[Git workflow](../.agents/rules/git.md), [branch protection](branch-protection.md)
and [Sonar guidance](sonarqube.md).

For foundation behavior, follow `src/application/authorization.ts`, `errors.ts`,
`identity.ts`, `localization.ts`, `models.ts`, `permissions.ts` and `validation.ts`.
The import closure also includes `src/application/ports/auth.ts` and the four
`src/contracts` modules for locales, OTP, permissions and profile bounds. Read
`src/application/foundation.test.ts` and `validation.test.ts` for actual behavior
evidence. Select the relevant source, type, lint and test checks from the
[canonical manifest](../.agents/validation.json), then run the full profile
before an authorized commit or PR.

Read actual owners and tests before making claims. Map entries, successful
configuration parsing and installed applications do not establish that an
assistant loaded instructions or that remote review ran.

Application service, remaining wire contract, runtime localization, adapter,
HTTP and deployment task owners will be added with their corresponding source
phases. Do not register unpublished paths as live owners or interpret ambient
local source as part of a checked partial publication.
