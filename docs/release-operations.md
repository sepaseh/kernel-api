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
restoration and pause writes. Record whether `kernel-api.service` is enabled,
pause any other automation that can start it, and run
`systemctl disable --now kernel-api.service` from the authorized root operator
shell. Verify that the unit is disabled and inactive before changing the
environment or the symlink. This prevents its normal boot-time start during
the interval when the environment and symlink can disagree.

Confirm clean shutdown before taking a matched DB/object backup, including SQLite
journal or WAL files as described in the recovery procedure. Keep a protected
copy of the previous `/etc/kernel-api/api.env` for rollback. Install the validated
environment at that path and atomically switch the current symlink to the approved
release. If interrupted, confirm that the environment and symlink select the same
release before starting the service.

Use `systemctl start kernel-api.service` to start the candidate while boot-time
activation is disabled. Verify health, release marker, login/permissions and
public/private file reads, and inspect the logs for the expected SERVER_RELEASE_ID.
After verification passes, restore the prior boot-time enablement with
`systemctl enable kernel-api.service` if it was enabled before the cutover.
Resume other start automation and reopen traffic after verification.

Docker uses immutable image tags and a stable Compose project/volume. Changing
RELEASE_ID selects a new artifact; never repurpose a published tag or remove real
volumes. Validate new config and certificate paths before `up -d --wait`.

Halt rollout for health failures, session regressions, authorization/data integrity
issues, missing objects, wrong release marker or unexpected external calls. Keep the
previous artifact AND compatible protected config AND matching recovery point.
For a native rollback, use the same stop and disable procedure before restoring
the previous environment and symlink together.
If old code understands the current schema, restore the prior artifact and validate.
Otherwise restore the matched SQLite/object backup before starting old code.
For a native rollback, start the restored release while boot-time activation is
still disabled and repeat the native cutover checks above. After verification
passes, restore boot-time enablement with `systemctl enable kernel-api.service`
only if the unit was enabled before the rollout. Use the state recorded before
the cutover.

Image rollback or symlink replacement does not reverse migrations. Record operator,
incident/release ID, evidence, data-loss window and recovery duration. Retain logs
and follow-up remediation; do not improvise unrelated forward fixes during rollback.

See [deployment references](deployment.md), [backup/recovery](backup-restore.md),
and [protected manual staging/smoke](deployment.md#protected-manual-api-checks). Coordinate security concerns
privately with the maintainers.
