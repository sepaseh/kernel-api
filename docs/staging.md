# Protected manual API checks

[English](staging.md) · [فارسی](staging.fa.md)

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
