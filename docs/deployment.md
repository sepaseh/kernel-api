# Independent API deployment

[English](deployment.md) · [فارسی](deployment.fa.md)

The repository includes independent deployment templates for:
[Docker/Compose](../deploy/docker/README.md) and [native Linux systemd/Nginx](../deploy/native/README.md).
These templates and fixture tests do not establish deployed or production readiness;
real OTP delivery remains unimplemented. They build and run only this repository.
Configure public API origin and exact
external admin/website origins; no other application checkout or shared Docker
network is required. When cohosting applications, use one operator-managed edge
and distinct upstream ports. Integrate the named server blocks into that edge with
only one pair of default host-rejection blocks per listen address; loading several
complete independent templates would duplicate `default_server`. Do not bind
several gateways to the same host ports.

API uses native Node.js 24 TypeScript and reviewed startup migrations. Durable
SQLite and public/private object state live outside immutable releases. Deployment
preflight rejects placeholder credentials, insecure public origins, relative local
state, database/upload paths inside the immutable release (including resolved
directory links), development OTP/seed flags and missing release identity. The checked-in release-ID placeholders must be replaced with an actual immutable
release identifier. Unknown HTTP hosts are dropped and unknown TLS names fail their handshake. Docker entrypoint
and native ExecStartPre enforce it. Native bootstrap is a separate explicit operator
operation on an empty database, using protected JSON STDIN and supplied environment.
The preflight accepts only a local SQLite `file:` URL with an absolute persistent
path outside the release and no host, query or fragment. Remote libSQL deployment
is not validated by this package.

Commands: `deploy:package` creates an exclusive API release; `deploy:render` substitutes
validated public fields from stdin into a fixed `bootstrap` or `kernel` template and
writes to stdout without corrupting Nginx variables; `deploy:check -- api`
validates supplied production configuration; `deploy:health -- api` checks semantic
readiness. None load developer env files or provision DNS/certificates. `test:deploy`
uses only synthetic local fixtures. `test:deploy:docker` requires an available local
Linux Docker engine, generates its own TLS/credentials/volumes and never uses a
remote Docker context. No remote deployment is triggered by normal CI.

Real SMS/email OTP delivery remains unimplemented. Bootstrap permits existing-account
password login; registration/recovery/email-verification production journeys require
a delivery adapter. Fixed development OTP is prohibited in production. Backups are
operator-owned procedures, not scheduled automation. Read [backup/recovery](backup-restore.md)
and [release/rollback](release-operations.md) before activating an upgrade.

## Protected manual API checks

Staging and deployment-smoke workflows are manual dispatch only and perform
read-only semantic `/health` and `/_kernel/release` checks. Configure protected
STAGING_ALLOWED_API_HOST or SMOKE_ALLOWED_API_HOST and EXPECTED_DEPLOYMENT_ID;
dispatch inputs cannot redefine the trusted allowlist/release. Staging also requires
PRODUCTION_HOST and rejects that host. URLs must be exact HTTPS origins without
credentials/path/query/hash. The expected release is independently supplied from
protected settings, not trusted from the remote response.

DAST is a separate manual protected staging-only template and can send mutating
scan traffic; do not dispatch without explicit target authorization. Release,
staging, smoke, DAST and Sonar templates neither provision an environment nor
establish that any remote workflow has run. No production service was contacted
while restoring these files.
