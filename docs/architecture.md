# Kernel API architecture

Kernel API owns database access, migrations, authentication and object storage.
Independent frontends consume its HTTP contracts. The publication inventory
defines what ships in the `local-runtime` phase and records
`applicationReady: false`. See the [publication inventory](../.github/bootstrap-policy.json)
and [validation manifest](../.agents/validation.json).

## Request flow and ownership

| Layer                                         | Responsibility                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [HTTP presentation](../src/presentation/http) | Hono routes parse input, authenticate and authorize requests, map errors, serialize responses and record request outcomes. |
| [Application](../src/application)             | Framework-free services implement use cases and business policy behind feature-specific ports.                             |
| [Infrastructure](../src/infrastructure)       | Adapters connect libSQL and Drizzle, Better Auth, OTP persistence, object storage, translation and logging to those ports. |
| [Contracts](../src/contracts)                 | Feature-owned modules define wire shapes and shared constants. Import them directly from their owners.                     |

The [composition root](../src/composition.ts) and
[dependency wiring](../src/dependencies.ts) connect the layers manually.
The [Node listener](../src/index.ts) binds before initializing the database and
storage. Clients receive a bodyless, non-cacheable 503 until the composed app is
ready. See [runtime sequences](sequences.md) and [local development](development.md).

Application services use plain TypeScript and erased imports from the
[message vocabulary](../src/application/localization.ts). The infrastructure
translation engine loads the ten literal API catalogs. Sonar's duplication
exception applies to the ten data files. The catalog registry, locale metadata
and measured source coverage retain their checks. See [API localization](localization.md)
and [SonarQube](sonarqube.md).

## Features and data integrity

The published HTTP contract covers authentication, accounts, calendar dates,
content categories, rich-text content, FAQs, files, languages, roles, settings
and users. The [Bruno collection](../collection/README.md) provides requests and
saved responses for all eleven groups. Read the
[client contract handoff](collection-guide.md#client-screen-contract-handoff)
before changing an independently released consumer.

Persistence owns transactions and checks mutable business references within
them. It derives full names from current stored columns and the fields supplied
by a patch. Deleting a record in use returns a localized 409 and preserves its
references. Allowed deletes remove rows permanently, including any owned
technical rows. Unused-file deletion records pending object cleanup so the
caller can retry a storage failure. See [database constraints](database-schema.md)
and [object storage](object-storage.md).

## Local and deployed behavior

The API reads configuration from the supplied environment. Use the synthetic
[configuration template](../.env.example) and [local development](development.md)
for startup, optional seeding and initial administrator provisioning. Local OTP
flows use explicit fixed-code settings. Production OTP delivery remains unavailable.
Local console formatting uses the development-only `pino-pretty` dependency.
See [authentication adapters](auth-adapters.md) and [backend logging](backend-logging.md).

Application tests use synthetic ports. Infrastructure tests exercise real libSQL,
Better Auth, i18next, Pino, local files and signed S3 SDK requests against an owned
loopback fixture. HTTP and listener suites exercise the local composition with
disposable data, including startup, cleanup and shutdown. See the
[test guide](testing.md) for suites and coverage.

Published [deployment tooling](deployment.md) covers release packaging,
Docker and native references, migration tooling and manual verification.
[Recovery tests](backup-restore.md) use matched synthetic database and object
fixtures and verify authenticated HTTP behavior and redacted log correlation.
Deployed integrations, operator setup and production delivery need their own
evidence. Native and Docker smoke commands require separate execution.

## Further reading

- [Change API behavior](feature-development.md)
- [Find source and tests by task](source-navigation.md)
- [Run the validation gate](validation.md)
- [Evaluate assistant guidance](../.agents/evaluation/README.md)
