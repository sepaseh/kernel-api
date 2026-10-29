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
