# API documentation map

[English](README.md) · [فارسی](README.fa.md)

- [Development and optional local MinIO](development.md)
- [Architecture](architecture.md), [feature changes](feature-development.md), [source navigation](source-navigation.md)
- [Database/migrations](database-schema.md), [runtime sequences](sequences.md), [backend logging](backend-logging.md)
- [Input validation](input-validation.md), [local catalogs](localization.md), [Bruno](collection-guide.md), [HTTP contracts](testing.md#http-contract-tests)
- [Production overview](deployment.md), [Docker](../deploy/docker/README.md), [native Linux](../deploy/native/README.md)
- [Backup/recovery](backup-restore.md), [release/rollback](release-operations.md), [manual release](releasing.md), [staging/smoke](deployment.md#protected-manual-api-checks)
- [Executable isolated restore and incident drills](backup-restore.md#isolated-recovery-drills)
- [Requirements handoff/implementation plan](feature-development.md#plan-the-change), [test reliability/flaky ownership](test-reliability.md)
- [Testing](testing.md), [canonical validation](validation.md)
- [Threat model](security/threat-model.md), [auth review](security/authentication-review.md), [security review schedule](security/reviews.md)
- [Branch protection](branch-protection.md), [required Sonar preflight](sonarqube.md), [security policy](../SECURITY.md)
- [Guidance evaluation](../.agents/evaluation/README.md)

Update the matching active English/Persian document whenever behavior, configuration,
checks or operational workflow changes. Dated reports describe their recorded scope
and do not establish results for later source; the 2026-10-24 archive has not been
independently verified.
