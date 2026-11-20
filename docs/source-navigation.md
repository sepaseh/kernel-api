# Find the owning source and tests

Start with [AGENTS.md](../AGENTS.md). Use the [source policy](../.github/bootstrap-policy.json)
to find admitted files, the [settings index](../.agents/settings.json) to find
assistant rules and the [task map](../.agents/navigation.json) to find source
owners, tests and checks.

## Repository guidance and Git

For rules and assistant workflows, read [.agents/README.md](../.agents/README.md),
[settings](../.agents/settings.json) and [guidance](../.agents/rules/guidance.md).
For branches, commits, PRs and reviews, use
[Git workflow](../.agents/rules/git.md), [branch protection](branch-protection.md)
and [Sonar guidance](sonarqube.md). The [CodeQL workflow](../.github/workflows/codeql.yml)
and policy regressions in [the governance tests](../scripts/check-governance.test.mjs)
own hosted JavaScript/TypeScript and GitHub Actions security scan configuration.
The [actionlint runner](../scripts/run-actionlint.mjs) and its [regressions](../scripts/run-actionlint.test.mjs)
validate the actual workflow files as part of Static checks.

## Application foundation

For foundation behavior, follow `src/application/authorization.ts`, `errors.ts`,
`identity.ts`, `localization.ts`, `models.ts`, `permissions.ts` and `validation.ts`.
The import closure also includes `src/application/ports/auth.ts` and the
`src/contracts` modules for locales, OTP, permissions, profile bounds and
public-settings language shapes. Read
`src/application/foundation.test.ts` and `validation.test.ts` for actual behavior
evidence. Select the relevant source, type, lint and test checks from the
[canonical manifest](../.agents/validation.json), then run the full profile
before an authorized commit or PR.

## Application services and catalogs

The `services-and-catalogs` task covers the ten application services, their
feature ports and contracts, and the ten literal API catalogs. Use the mapped
synthetic-port tests for application policy in account, auth, calendar, files,
roles, settings and users. For content categories, contents and FAQs, the
primary behavior suites run through HTTP and disposable libSQL. The catalog
integrity tests cover key parity and locale metadata.

## Configuration and storage

The `configuration-and-storage` task owns explicit configuration parsing, real
translation, structured logging, fatal process handlers and local/MinIO storage.
Use the engine, subprocess, filesystem and signed loopback SDK tests for evidence.
Read [logging](backend-logging.md) and [object storage](object-storage.md).

## Database and authentication

The `database-auth` task covers `drizzle/`, `src/infrastructure/db`,
`src/infrastructure/persistence`, `src/infrastructure/auth`, the administrator
bootstrap owner and its command. Start with [database schema](database-schema.md),
[authentication adapters](auth-adapters.md) and the
[data-lifecycle rule](../.agents/rules/data-lifecycle.md). Follow the persistence
and management/lifecycle integration suites, the real auth integration scripts,
gateway tests and owned fixture-cleanup tests listed in the task map. Use fresh
owned databases and synthetic configuration; never inspect an existing database
or environment as a comprehension fixture.

## HTTP and client contracts

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
the [client screen contract handoff](collection-guide.md#client-screen-contract-handoff).

For file management, use the [file HTTP suite](../src/test/integration/file-management-http.test.ts)
and [object storage guide](object-storage.md#file-management).
For editorial workflows, follow the
[category suite](../src/test/integration/content-categories-http.test.ts),
[rich-text content suite](../src/test/integration/contents-http.test.ts) and
[FAQ suite](../src/test/integration/faqs-http.test.ts). The tests cover route
permissions, serialization, ordered lists and transaction failures.

The `collection-contracts` task owns Bruno requests and response examples.
The inventory declares the eleven published groups in `collectionGroups`.
The full validation profile covers their feature suites. See
[collection setup](../collection/README.md) and [HTTP contracts](collection-guide.md).

## Deployment and recovery

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

## Assistant evaluation and hooks

The guidance task also owns the [evaluation prompts](../.agents/evaluation/README.md),
optional hooks and their integrity/portability suites. Static checks validate
references and blank templates; they do not execute comprehension evaluations
or establish host instruction loading or hook installation.
