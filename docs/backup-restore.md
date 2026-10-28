# Coordinated database and object recovery

[English](backup-restore.md) · [فارسی](backup-restore.fa.md)

Choose an owner, schedule, retention, acceptable data-loss window and recovery
objective for the actual service. Kernel provides this procedure and a
[synthetic isolated recovery drill](recovery-drills.md), not automated production
backups, an operator restore command or a promised recovery time. Never rehearse against the
developer data or an active production database.

Preserve one matched recovery point: SQLite plus remaining WAL/journal sidecars,
all local-private/local-public objects or both MinIO buckets and access policies,
release/migration identity, driver/paths/origins and protected secret-store version
references. SQLite holds metadata only; DB-only restoration cannot reconstruct
uploads. Protect backups containing credential hashes, personal data, sessions
and private objects. Recover secrets through the protected secret store separately.

1. Record release ID, migration level, selected storage and resolved paths. Pause
   all writes and direct storage writers; stop API and prevent supervisor restart.
2. After confirmed clean shutdown, copy the closed SQLite file and any associated
   journal/WAL files together. Never copy only the main file while writers run.
3. Capture the complete local object tree, or both MinIO buckets with keys, content
   types and public/private policies. Changing driver never converts old metadata.
4. Store backups outside live data/release directories. Record timestamp, sizes,
   checksums, counts and read-only object-reference inventory in a protected manifest.
   Verify completion before restarting the original instance and checking health.
5. Restore into NEW isolated DB/storage locations using the matching release and
   protected configuration. Disable development seed and preserve backup originals.
6. Before API startup, run `PRAGMA integrity_check` (expect ok) and
   `PRAGMA foreign_key_check` (expect no rows) on the restored SQLite copy. Verify
   migration history; startup applies pending migrations, so rehearse upgrades on
   a further copy rather than overwriting the recovery point.
7. Start the isolated API; check health, authorized login, roles, settings, calendar,
   counts and every referenced object. Verify private objects remain inaccessible
   publicly and public logos/content types match. Record recovered data timestamp,
   elapsed recovery time and discrepancies before approving the recovery point.

Restoration also restores old sessions and OTP records. Decide whether to revoke
them before returning service, particularly after an authentication incident.
For a real restoration, pause writers again, preserve outgoing state and switch
to the approved matching DB/object pair; repeat checks before reopening traffic.
Do not merge recovery points or downgrade data by editing migration files.
[Release operations](release-operations.md) explains activation and rollback.
