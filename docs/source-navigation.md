# Navigating the API source

[English](source-navigation.md) · [فارسی](source-navigation.fa.md)

Start with [AGENTS.md](../AGENTS.md), then select the relevant task in
[the task map](../.agents/navigation.json). Read the owning contract, application
service, adapter, route and tests together; a matching type alone does not establish
the behavior of a complete request.

The API owns its runtime and data. Other applications consume its HTTP contracts
through independent checkouts. For changes to authentication or sessions, consult
[authentication](auth-adapters.md) and the [security checklist](security/authentication-review.md).
For storage or deletion, consult [storage](object-storage.md),
[database constraints](database-schema.md) and [HTTP transport](http-transport.md).
For deployment and recovery, start with [deployment](deployment.md) and
[backup and restore](backup-restore.md).

For a client screen's API handoff, start with the
[collection guide](collection-guide.md#client-screen-contract-handoff),
[contract testing](contract-testing.md), and [input validation](input-validation.md).
Use [request sequences](sequences.md) and [logging](backend-logging.md) to trace
runtime flows; the [decision index](adr/README.md) records architectural choices.

Use [validation](validation.md) for executable checks. Never use a real environment
file, existing data or a production service as a local test fixture.
