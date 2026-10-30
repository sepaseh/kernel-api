# API runtime

[English](api-runtime.md) · [فارسی](api-runtime.fa.md)

This standalone project owns Hono presentation, framework-free application services
and ports, persistence/auth/storage adapters, manual composition and reviewed SQL
migrations. Node.js 24 executes src/index.ts directly. src/bootstrap-admin.ts is a
separate explicit operator command; drizzle/ contains reviewed startup migrations.

Clients consume this API through HTTP. See [architecture](architecture.md),
[HTTP transport](http-transport.md), and [database constraints](database-schema.md).

Use the [repository setup guide](../README.md), [source navigation](source-navigation.md),
[backend rule](../.agents/rules/backend.md) and [validation policy](validation.md).
Relative development state paths resolve against this repository; production state
must stay outside immutable releases.

The listener responds with 503 until initialization is complete. Local-runtime
tests use synthetic data and do not establish production readiness or real OTP
delivery. Operator deployment and recovery remain separate procedures; see
[deployment](deployment.md) and [backup and restore](backup-restore.md).

## MinIO configuration

With `STORAGE_DRIVER=minio`, provide nonempty `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_ENDPOINT` and `MINIO_PUBLIC_URL` in protected
configuration outside Git. `MINIO_ENDPOINT` is a hostname or literal IP, without a
scheme; use `MINIO_PORT` for its port and set `MINIO_USE_SSL=true` for TLS.
TLS is required outside `localhost` and literal loopback addresses; a DNS name
that resolves locally is not a loopback exception. `MINIO_PUBLIC_URL` requires
HTTPS outside loopback and must not contain credentials, a query or a fragment.
See [object storage](object-storage.md) for bucket ownership, region and operations.

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
