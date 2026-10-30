# API runtime boundaries

[English](api-runtime.md) · [فارسی](api-runtime.fa.md)

This standalone API composes HTTP routes, framework-independent services and
infrastructure adapters within one checkout. It owns its database, authentication
and storage; clients communicate through HTTP. See [architecture](architecture.md),
[HTTP transport](http-transport.md) and [database constraints](database-schema.md).

The listener responds with 503 until initialization is complete. Local-runtime
tests use synthetic data and do not establish production readiness or real OTP
delivery. Operator deployment and recovery remain separate procedures; see
[deployment](deployment.md) and [backup and restore](backup-restore.md).

## Deleting users and roles

DELETE /users/{user_id} keeps authentication, users.delete permission, self-delete
and final-active-system-administrator guards. It checks user-role memberships and
uploaded-file metadata references in the deletion transaction. A user in use
returns HTTP 409 with the existing {message} response shape in the persisted
system language, asking the caller to resolve dependent uses before retrying.
Conflict leaves the user, assignments, file metadata/objects and identity records
unchanged; no soft-delete marker or silent reference cleanup is used.

An eligible, unused user is permanently deleted with bodyless 200 OK; owned
sessions and authentication accounts cascade only after that allowed deletion.
DELETE /roles/{role_id} likewise rejects assigned roles with an actionable 409
and preserves assignments; an allowed role deletion cleans up its owned
permissions. These owned technical records differ from incoming business uses.

Resolve user memberships through the existing authorized role-replacement
operation. No file-deletion or creator-reassignment endpoint is currently
implemented; such references remain a genuine blocker. Do not invent an endpoint,
clear creator IDs or delete file objects to make the user-delete request succeed.
See the [database constraints and migration review](database-schema.md) and the
[user](../collection/users/delete/index.bru)/[role](../collection/roles/delete/index.bru)
contracts for exact failure and success behavior.
