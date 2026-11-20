# Change API behavior

Use this checklist for a change that affects an API consumer or persisted data.
Start with the [source map](source-navigation.md) to find the owning contract,
application service, adapter and tests.

1. **Define the observable change.** Specify the trigger, expected response,
   authorization and failure behavior. For API-backed screens, trace requests
   and states using the [client contract handoff](collection-guide.md#client-screen-contract-handoff).
   Identify independently released consumers and plan rollout and rollback for
   incompatible changes.
2. **Trace the ownership boundary.** Put wire shapes in the feature contract,
   request parsing and response mapping in the HTTP adapter, business policy in
   the application service and atomic writes in persistence. See the
   [backend rules](../.agents/rules/backend.md).
3. **Update consumer evidence.** Keep the affected Bruno operations, examples,
   tests and English guides aligned with the source. Cover the successful
   operation and relevant failure paths with disposable synthetic fixtures.
4. **Verify before handoff.** Run focused checks for the changed behavior and use
   the [validation guide](validation.md) for the complete gate before an
   authorized commit or PR. Record actual results, skipped checks and limits in
   the current task.

## Deletions, status and relationships

Check incoming business references and perform hard deletion in one transaction.
A record in use returns a localized 409 that asks the caller to resolve
dependent records first. Preserve the record and its references when the
operation fails. An allowed user delete can remove owned sessions and
authentication accounts. An allowed role delete can remove owned role
permissions. Memberships and uploaded-file ownership are business references
that block user deletion. Contents similarly protect their categories and cover
files from deletion. See the [data lifecycle rule](../.agents/rules/data-lifecycle.md)
and [database constraints](database-schema.md).

Exercise the allowed delete, conflict and rollback paths. Preserve current
session, assignment and file guarantees and consider concurrent references.
If a migration is needed, verify compatibility with existing data and plan how
to recover. See [database migrations](database-schema.md#migration-and-validation-boundaries)
and [backup and restore](backup-restore.md).
