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

For an API-backed client screen, complete the [client screen contract handoff](collection-guide.md#client-screen-contract-handoff) using existing routes, permissions and response examples. Record any proposed contract gap separately and coordinate incompatible HTTP changes with the consuming application.
