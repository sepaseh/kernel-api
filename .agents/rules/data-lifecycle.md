# API data lifecycle

Read this rule for delete, deactivation, assignment, foreign-key or retention work.
Trace the owning application service, transaction, schema, Bruno operation and tests.
Use the [database relationships](../../docs/database-schema.md) and
[backend boundaries](backend.md); a UI action or foreign key alone does not define
the complete contract.

## Hard deletion only

Soft deletion is prohibited in the database, models, persistence adapters, queries
and HTTP contracts. Do not add deleted_at, deleted_by, is_deleted, tombstones,
hidden deletion filters, recycle bins, a deleted status or include_deleted queries.
A successful delete permanently removes the record.

An explicit active/inactive business status is separate from deletion. It must not
hide a record as though it had been deleted or replace an unsuccessful hard delete.

## Reject deletion of records in use

Usage relationships include business records and assignments, such as uploaded-file
ownership and user-role memberships. Owned technical rows, such as the user's
sessions/authentication accounts or a role's permission rows, belong to their
parent resource and may be cleaned up with an allowed hard delete. This does not
permit deleting other business records or silently removing assignments to bypass
a usage conflict.

- Check actual incoming references and dependent usage before deletion. A declared
  relation with no referencing rows does not by itself make a record in use.
- If another record uses the item, reject deletion with HTTP 409 Conflict and a
  display-ready message in the selected system language: explain that the item is
  in use and its dependent records must be resolved first. Keep the existing
  message response shape; do not expose raw SQL, table names or constraint errors.
- Leave the target and all related data unchanged on conflict. Do not silently
  remove assignments, clear reference fields, delete dependent business records or
  rely on cascading deletion to bypass the usage restriction. Related records must
  be resolved through explicit, authorized domain operations before retrying.
- Check references and perform deletion within the same concrete transaction.
  Use restrictive foreign-key behavior for usage relationships to prevent a
  concurrent assignment from bypassing the check. Map verified dependency
  constraint failures during deletion to the same conflict after rollback; do not
  disguise unrelated infrastructure failures as an in-use error.
- Preserve authentication, authorization and self/final-active-administrator
  guards. Session revocation and storage cleanup retain their own atomicity and
  failure requirements; they are not substitutes for the reference check.

## Implementation and evidence

User deletion rejects uploaded-file ownership and role memberships atomically;
assigned-role deletion also returns a conflict. Once business usage is resolved,
allowed deletion is physical and owned technical rows are removed. Inspect the
owning services, ports, foreign keys and transactions when extending this policy;
do not assume a cascade or SET NULL permits discarding business usage. Schema
behavior does not imply a public delete endpoint that is not actually implemented.

Update the owning [collection contract](api-collection.md), transaction/failure
tests and operating guidance when behavior changes. Tests use disposable synthetic
state and cover unused-record success, in-use conflict with no partial writes and
concurrent reference creation. Never delete real records or run production
migrations to demonstrate a rule.
