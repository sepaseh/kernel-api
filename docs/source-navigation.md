# Task navigation

Start with [AGENTS.md](../AGENTS.md). The machine-readable
[task map](../.agents/navigation.json) lists the published owners and their tests.

For rules and assistant workflows, read [.agents/README.md](../.agents/README.md),
[settings](../.agents/settings.json) and [guidance](../.agents/rules/guidance.md).
For branches, commits, PRs and reviews, use
[Git workflow](../.agents/rules/git.md), [branch protection](branch-protection.md)
and [Sonar guidance](sonarqube.md). The [CodeQL workflow](../.github/workflows/codeql.yml)
and policy regressions in [the governance tests](../scripts/check-governance.test.mjs)
own hosted JavaScript/TypeScript and GitHub Actions security scan configuration.
The [actionlint runner](../scripts/run-actionlint.mjs) and its [regressions](../scripts/run-actionlint.test.mjs)
validate the actual workflow files as part of Static checks.

For foundation behavior, follow `src/application/authorization.ts`, `errors.ts`,
`identity.ts`, `localization.ts`, `models.ts`, `permissions.ts` and `validation.ts`.
The import closure also includes `src/application/ports/auth.ts` and the
`src/contracts` modules for locales, OTP, permissions, profile bounds and
public-settings language shapes. Read
`src/application/foundation.test.ts` and `validation.test.ts` for actual behavior
evidence. Select the relevant source, type, lint and test checks from the
[canonical manifest](../.agents/validation.json), then run the full profile
before an authorized commit or PR.

The `services-and-catalogs` task covers the seven application services, their
feature ports/contracts and the ten literal API catalogs. Inspect each service's
synthetic-port suite and the catalog integrity tests; those establish application
policy and data boundaries, not adapter behavior.

The `configuration-and-storage` task owns explicit configuration parsing, real
translation, structured logging, fatal process handlers and local/MinIO storage.
Use the engine, subprocess, filesystem and signed loopback SDK tests for evidence.
Read [logging](backend-logging.md) and [object storage](object-storage.md).

The `database-auth` task covers `drizzle/`, `src/infrastructure/db`,
`src/infrastructure/persistence`, `src/infrastructure/auth`, the administrator
bootstrap owner and its command. Start with [database schema](database-schema.md),
[authentication adapters](auth-adapters.md) and the
[data-lifecycle rule](../.agents/rules/data-lifecycle.md). Follow the persistence
and management/lifecycle integration suites, the real auth integration scripts,
gateway tests and owned fixture-cleanup tests listed in the task map. Use fresh
owned databases and synthetic configuration; never inspect an existing database
or environment as a comprehension fixture.

The `http-contract` task owns Hono routes under `src/presentation/http`, manual
composition in `src/composition.ts` and `src/dependencies.ts`, and the local
listener in `src/index.ts`. Read [HTTP transport](http-transport.md),
[development](development.md) and [input validation](input-validation.md).
Trace input, authorization, application policy, the adapter transaction and the
serialized response through the owning tests. HTTP integration suites exercise
transport, uploads, logging and deletion conflicts; runtime and seed scripts use
disposable databases/storage to exercise startup, readiness, cleanup and shutdown.
For an API-backed screen, provide the feature DTOs, route behavior and error
evidence; visual/component decisions belong to the consuming frontend. Follow
the [client screen contract handoff](collection-guide.md#client-screen-contract-handoff),
using Bruno operations only when their groups are published.

The `deployment` task covers owned packaging, deployment references, migration
tooling, recovery workers and manual workflow targets. Start with
[deployment](deployment.md), [release operations](release-operations.md),
[backup/recovery](backup-restore.md) and [security review](security/reviews.md).
The [operations policy](../scripts/check-operations-policy.mjs) owns the four
manual workflows for release metadata, staging verification, deployment smoke
verification and the staging DAST preflight. The native CodeQL workflow remains under the
security policy described above.
Use the real CLI toolchain fixtures, template/parser tests, loopback checks and
resource-cleanup tests as evidence. Native/Docker smoke execution is opt-in;
publishing its command or testing cleanup helpers does not prove a smoke run.

Read actual owners and tests before making claims. Map entries, successful
configuration parsing and installed applications do not establish that an
assistant loaded instructions or that remote review ran.

Collection group owners will be added with their corresponding source phases.
Do not register unpublished paths as live owners or interpret
ambient local source as part of a checked partial publication.
