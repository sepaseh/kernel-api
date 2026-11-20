# Build, package and deploy

Use this guide to prepare an immutable release and verify an authorized
deployment.
Choose the [Docker Compose reference](../deploy/docker/README.md) for a
containerized API and gateway, or the [native Linux reference](../deploy/native/README.md)
for systemd and Nginx. The `local-runtime` phase publishes both references and
keeps `applicationReady` set to `false`.

## Before deployment

- Use the [pinned Node.js runtime](../.nvmrc) and the reviewed migrations. Store
  SQLite and [object storage](object-storage.md) outside the immutable release.
  Deployment preflight requires an absolute persistent SQLite `file:` URL
  without a host, query or fragment.
- Set the public HTTPS API origin, exact external frontend origins, a generated
  auth secret and an immutable release ID. Provide the settings explicitly to
  the runtime. Docker's entrypoint and systemd's `ExecStartPre` validate the
  production environment. The edge drops unknown HTTP hosts and rejects unknown
  TLS names.
- When cohosting applications, use one operator-managed edge and distinct
  upstream ports. Integrate the named Nginx server blocks with one default
  host-rejection pair per listen address.
- Bootstrap the first administrator in a database without users using protected
  JSON on standard input. Existing accounts can sign in with a password.
  Registration, password recovery and email verification require production OTP
  delivery, which is still unimplemented. Production preflight rejects fixed
  development codes and development seeding.

Review the [backup and recovery procedure](backup-restore.md) and
[release operations](release-operations.md) before activating a release.

## Commands

Run these commands from the trusted source checkout. Supply protected production
configuration only when performing authorized deployment preflight.

| Command                                  | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run deploy:package -- --release=ID` | Write an exclusive native release to `dist/releases/ID`.                             |
| `npm run deploy:render -- --template …`  | Read public settings from standard input and render Nginx.                           |
| `npm run deploy:check -- api`            | Validate the supplied production environment.                                        |
| `npm run deploy:health -- api`           | Check that the local `/health` returns `200` and `ok`.                               |
| `npm run test:deploy`                    | Run deployment tooling tests with synthetic local fixtures.                          |
| `npm run test:deploy:native`             | Install production dependencies in a test release and check local startup and login. |
| `npm run test:deploy:docker`             | Exercise the API and gateway using a local Linux Docker engine.                      |

The renderer accepts `bootstrap` and `kernel` as template names. See the linked
deployment references for smoke prerequisites and expected results.

## Protected manual API checks

Dispatch [API staging verification](../.github/workflows/staging.yml) or
[API smoke verification](../.github/workflows/deployment-smoke.yml) with `api_url`
set to an authorized HTTPS origin without credentials, a path, a query or a
fragment. Configure the following in the corresponding protected GitHub
environment before dispatching it.

| Environment | Required variables                                                      |
| ----------- | ----------------------------------------------------------------------- |
| `staging`   | `STAGING_ALLOWED_API_HOST`, `PRODUCTION_HOST`, `EXPECTED_DEPLOYMENT_ID` |
| `smoke`     | `SMOKE_ALLOWED_API_HOST`, `EXPECTED_DEPLOYMENT_ID`                      |

Staging rejects the configured production host. Both workflows make read-only
requests and require a healthy `/health` response plus an exact release ID match
from `/_kernel/release`. Set `EXPECTED_DEPLOYMENT_ID` from the approved release.
The release marker comes from the gateway, so also verify the running API's
release ID through its startup logs during cutover.

The manual DAST workflow validates the initial HTTPS origin against the
protected `STAGING_ALLOWED_API_HOST` and `PRODUCTION_HOST` settings, then stops
before running a scanner. Re-enabling active scans requires a reviewed workflow
change and verified scanner egress that allows only the authorized staging
origin, including redirect targets. Active scans can send mutating requests
and require explicit target authorization.

Release, staging, smoke, DAST and Sonar configuration neither provisions an
environment nor establishes that any remote workflow has run. Local tests use
owned fixtures; source publication does not authorize a real deployment or an
external scan. `applicationReady` remains false.
