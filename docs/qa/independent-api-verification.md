# Independent API verification — 2026-10-24

[English](independent-api-verification.md) · [فارسی](independent-api-verification.fa.md)

This is a historical record concerning 24 October 2026. Its execution claims have not been independently verified and do not describe the current project state. See [validation](../validation.md) for current checks.

This is the execution snapshot before the later requirements re-audit and new
recovery/incident cases. Keep its executed counts historical; see the
[requirements audit](requirements-audit-2026-10-24.md) for the additions/current scope.

Executed in `kernel-api` on Windows with Node.js 24.18.0 and npm 12.0.2.
Tests used synthetic disposable state rather than private environment files or
existing runtime data. No commit, push or remote deployment was performed.

`npm run validate -- full` passed all 15 required checks. This included 109 API
tests, 16 selected HTTP contract tests, 24 deployment tests, 18 tooling tests,
9 catalog-integrity tests, 14 guidance tests, 6 source-boundary regression
tests and the 4 application/presentation architecture cases. Some suites overlap;
these counts are per command, not a sum of unique cases. Typechecking, lint,
formatting, Knip and the native-TypeScript build check passed. The online audit
completed with no high/critical findings and four moderate dependency findings
through MinIO (`decode-uri-component`, `query-string`, `stream-json`, `minio`);
the existing gate uses `--audit-level=high`. Dependencies were not changed to hide
or suppress those findings.

`npm run test:deploy:native` passed against a freshly packaged immutable release:
production-only dependency installation, configuration preflight, migrations,
first-administrator provisioning, health and authenticated HTTP all ran from the
payload. Generated state lived in a separate temporary directory. The payload and
state were removed after verification. This verifies the Windows payload; Linux
systemd execution, host permissions, DNS and Certbot were not exercised.

`npm run test:deploy:docker` passed against the local Linux Docker engine. It built
the independent API and Nginx images and checked HTTPS readiness, unknown HTTP
host and TLS-name rejection, HTTP redirect, immutable release marker/no-store,
one-time administrator bootstrap, secure cookies and authenticated sessions,
foreign-Origin rejection, explicit missing-OTP-delivery failure, public/private
upload isolation and retained files/sessions after API container replacement.
Its generated credentials, certificate, Compose project, volume, network and
temporary files were removed. No remote Docker context was used.

Deployment regression cases also cover top-level and nested source-directory
junction containment, immutable output containment, and durable state paths that
resolve inside a release through a directory link. Gateway validation shell files
use LF so Linux can execute them. Active guidance and formatting were checked
again after the final documentation edits.

These results do not claim hosted CI/CodeQL/Sonar/DAST execution, a real OTP
provider, external MinIO operation, scheduled backups, a production recovery drill
or a fresh assistant-comprehension benchmark.
