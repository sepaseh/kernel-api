# Contract and source boundary checks

[English](contract-testing.md) · [فارسی](contract-testing.fa.md)

`npm run test:coverage` runs the published HTTP, collection, architecture and
input-validation suites along with application, persistence and other tests.
`npm run check:boundaries` checks source and contract import boundaries.
The boundary tests cover static, type-only, dynamic, re-export, require and
resolved-alias guards. Use the [validation manifest](../.agents/validation.json)
for the full required profile: `npm run validate -- full` before an authorized
commit or PR handoff. Synthetic tests do not prove deployed authorization.

Consumer contract tests belong to their independently released clients. Automated
Pact provider verification is not implemented and is not claimed here. Independent contracts
are intentional snapshots; public field, status, auth and cookie compatibility,
not identical package source, is the release contract.
