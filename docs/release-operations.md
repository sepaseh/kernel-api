# Immutable releases, upgrades and rollback

A release owner approves immutable artifacts, checks evidence and records source,
lockfile, platform, checksum, public origins, configuration references and migration
level. An authorized deployment operator activates the approved artifact. The
manually dispatched release metadata workflow requires appropriate remote
configuration and verification; it must not deploy infrastructure. See
[manual release metadata](releasing.md).
Independent admin/website releases must remain compatible with the API wire contract.
Local catalogs and contracts are intentionally independent; no registry or mandatory
cross-repository translation synchronization is assumed.

For native Linux, run `npm run validate -- full` on the exact trusted source,
then package with `deploy:package`, install
runtime dependencies on the target OS/CPU, verify ownership/permissions and preserve
an earlier release. Prepare a protected candidate environment with the intended
release ID and state paths. Validate it from the candidate release directory with
the runtime identity before switching `/srv/kernel-api/current`. Replace
`RELEASE_ID` with the candidate's ID:

```sh
systemd-run --unit=kernel-api-validate --collect --wait --pipe \
  --property=User=kernel-api \
  --property=WorkingDirectory=/srv/kernel-api/releases/RELEASE_ID/api \
  --property=EnvironmentFile=/etc/kernel-api/candidate-api.env \
  /usr/bin/node scripts/validate-deployment-env.mjs api
```

If validation fails, correct the candidate while the current release and its
protected environment stay in place. Rehearse migration against an isolated
restoration, pause writes and stop the API while preventing supervisor restart.
Confirm clean shutdown before taking a matched DB/object backup, including SQLite
journal or WAL files as described in the recovery procedure. Install the validated
environment at `/etc/kernel-api/api.env`, atomically switch the current symlink to
the approved release, then start. Verify health, release marker,
login/permissions and public/private file reads before reopening traffic. Inspect
journald/container logs with the expected SERVER_RELEASE_ID.

Docker uses immutable image tags and a stable Compose project/volume. Changing
RELEASE_ID selects a new artifact; never repurpose a published tag or remove real
volumes. Validate new config and certificate paths before `up -d --wait`.

Halt rollout for health failures, session regressions, authorization/data integrity
issues, missing objects, wrong release marker or unexpected external calls. Keep the
previous artifact AND compatible protected config AND matching recovery point.
If old code understands the current schema, restore the prior artifact and validate.
Otherwise restore the matched SQLite/object backup before starting old code. Image
rollback or symlink replacement does not reverse migrations. Record operator,
incident/release ID, evidence, data-loss window and recovery duration. Retain logs
and follow-up remediation; do not improvise unrelated forward fixes during rollback.

See [deployment references](deployment.md), [backup/recovery](backup-restore.md),
and [protected manual staging/smoke](deployment.md#protected-manual-api-checks). Coordinate security concerns
privately with the maintainers.
