# ADR 0005: Repository and HTTP contract ownership

[English](0005-independent-repositories.md) · [فارسی](0005-independent-repositories.fa.md)

Status: accepted. This API is one installable npm project with source in src/,
SQL migrations in drizzle/, root configuration and one package.json/lockfile.
Contracts and complete language catalogs are maintained as local source.

The API exclusively owns backend implementation, DB, migrations, authentication
and storage. Consumers integrate over configured HTTP origins. A matching type
definition alone does not prove compatibility: review fields, statuses, session
cookies and configured language for affected releases.

Tests, guidance, CI, Docker and native operating instructions belong to this
repository. Deployment state and credentials are operator-owned and stay outside
immutable code releases. See [architecture](../architecture.md),
[deployment](../deployment.md) and [evaluation](../comprehension-evaluation.md).
