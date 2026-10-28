# API Docker deployment reference

[English](README.md) · [فارسی](README.fa.md)

API deployment templates are not evidence of production readiness. Real OTP
delivery and deployed integration remain unverified.

Use a Linux Docker engine and Compose with required `env_file` support. Provision
the API and host configuration in protected files outside Git; example environment
files are not included in this published snapshot. Set a generated auth secret,
immutable RELEASE_ID, API_HOST,
API_PUBLIC_ORIGIN, exact external SERVER_ALLOWED_ORIGINS, absolute API_ENV_FILE and
TLS_CERT_DIRECTORY. The configuration preflight rejects placeholders.

Supply real DNS and an existing certificate for API_HOST before starting. The TLS
directory must contain real `fullchain.pem` and `privkey.pem` files; gateway startup
refuses missing files. Issue certificates through your DNS/standalone ACME process
while ports are free. This stack does not issue certificates or fall back to plain
HTTP API serving. Renewal requires publishing the updated certificate files and
validating/reloading Nginx. Keep the certificate directory and API env root-protected.

```sh
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml config --quiet
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml build
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml up -d --wait
```

The API image installs production dependencies from this repository's lock and
preserves one root package and real local TypeScript source. It runs as `node` and
validates production config before startup. Only gateway ports are published;
API port 3000 stays internal. The named `api-data` volume is mounted at
`/var/lib/kernel-api`; Compose fixes durable DB/upload paths there. Retain the same
Compose project name when replacing a release so the volume is reused. Never run
`down --volumes` against real state. One API replica owns the SQLite file.
The gateway uses Docker's embedded DNS to refresh the API service address every
10 seconds; a container replacement can still cause a brief interruption.

Provision the first administrator only once on an empty installation. Validate the
API environment, prepare protected JSON containing first_name, last_name, mobile,
username and password outside Git, and pass it by STDIN:

```sh
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml exec -T api node scripts/validate-deployment-env.mjs api
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml exec -T api node src/bootstrap-admin.ts < /secure/path/initial-admin.json
```

No account reset, session or token is created by bootstrap. Delete the temporary
protected input according to your secret policy. Registration/recovery/email
verification still need real OTP delivery. Verify `/health`, login, permissions,
public/private objects and `/_kernel/release` against the intended release ID.

For update, pause writes, stop the API and confirm its clean shutdown before
capturing a coordinated DB/object backup. Build/pull a new immutable tag, then
run `up -d --wait`. Keep prior tags and protected configuration.
A previous image does not undo migrations: restore the matching DB/objects when
schema rollback requires it. [Recovery procedure](../../docs/backup-restore.md)
and [release operations](../../docs/release-operations.md) define checks.
External MinIO is optional; configure TLS, explicit credentials/bucket/public origin
in the API env. Changing driver does not migrate existing metadata or objects.

`npm run test:deploy:docker` is an opt-in local synthetic HTTPS smoke test. It forces
the local engine endpoint, creates random credentials/certificates, uses a unique
Compose project and disposable volume, and verifies bootstrap, sessions, foreign
Origin rejection, public/private files and persistence after container replacement.
Every run uses a unique `docker-container` Buildx builder with `default-load=true`;
its selector is scoped to the test process and never changes the selected global
builder. Success, failure and handled SIGINT/SIGTERM cancellation remove the exact
test containers, Compose project/volume/network, two image tags, builder and its
build cache, plus generated TEMP files. Certificate generation uses the test's own
gateway image. Cleanup continues after individual failures and a cleanup failure
fails the command. Preexisting name/tag collisions are rejected without deleting
those resources. No routine global image/cache prune is used, and Docker's shared
BuildKit runtime image is installed tooling rather than a per-test output.

Docker unavailability is failure, never a successful smoke result. No production
target is accepted. It prints its resource identifiers and TEMP directory, without
generated credentials. A forced process/host kill cannot run cleanup; remove only
those recorded test resources after verifying ownership before rerunning.
