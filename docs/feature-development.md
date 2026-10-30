# Changing API behavior

[English](feature-development.md) · [فارسی](feature-development.fa.md)

Identify the HTTP contract, application policy, owning port and adapter before
editing. Keep application policy independent of infrastructure; parse and map
requests at the HTTP boundary, and enforce persistence invariants atomically in
the adapter. Coordinate incompatible wire changes with independent consumers.

For deletion or relationship changes, preserve business references and return
the existing semantic conflict instead of soft-deleting or silently removing
dependent records. See [database constraints](database-schema.md) and
[HTTP transport](http-transport.md).

Add focused tests for behavior and relevant failure paths, using disposable
fixtures. Update English and Persian human documentation together and run the
required [validation](validation.md) before an authorized handoff.

For delete, status or relation changes, read the canonical
[data lifecycle rule](../.agents/rules/data-lifecycle.md) and the owning schema,
transaction and HTTP examples. Preserve current session, assignment and file
integrity while applying the deletion policy: no soft deletion, and no hard delete
of a record used by another business record or assignment. Implement a localized 409 conflict that asks
the caller to resolve dependent records first, preserving all data on failure.
Check references and deletion atomically; do not silently unlink or cascade-delete
dependent business records to make the operation succeed. Owned sessions and
authentication accounts are removed with an allowed user delete; role permissions
are removed with an allowed role delete. User-role memberships and uploaded-file
ownership block user deletion until resolved. Verify new paths against the same
policy and transaction guarantees.

For a client screen plan, first complete the
[client screen contract handoff](collection-guide.md#client-screen-contract-handoff).
It identifies existing API behavior and any proposed contract gap before frontend
implementation; component libraries and visual decisions stay with that frontend.
