# Immutable releases, upgrades and rollback

[English](release-operations.md) · [فارسی](release-operations.fa.md)

A release owner approves immutable artifacts, checks evidence and records source,
lockfile, platform, checksum, public origins, configuration references and migration
level. An authorized deployment operator activates the approved artifact. Automation
for release metadata or PRs requires separate configuration and is not included or
validated in this snapshot; it must not deploy infrastructure.
Independent admin/website releases must remain compatible with the API wire contract.
Local catalogs and contracts are intentionally independent; no registry or mandatory
cross-repository translation synchronization is assumed.

For native Linux, package from a clean trusted source with `deploy:package`, install
runtime dependencies on the target OS/CPU, verify ownership/permissions and preserve
an earlier release. Before switching `/srv/kernel-api/current`, rehearse migration
against an isolated restoration, pause writes and stop the API while preventing
supervisor restart. Confirm clean shutdown before taking a matched DB/object backup,
including SQLite journal or WAL files as described in the recovery procedure.
Atomically switch the current symlink to the complete approved release,
validate its protected environment, then start. Verify health, release marker,
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

See [production modes](deployment.md), [backup/recovery](backup-restore.md),
and [protected manual staging/smoke](staging.md). Coordinate security concerns
privately with the maintainers.
