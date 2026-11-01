# Governance testing

Test observable policy failures using synthetic GitHub responses and owned
temporary fixtures. Never read real tokens, environments, databases, uploads or
other checkouts as fixtures.

Cover incomplete and unsafe pagination, duplicate or missing changed-file
entries, hard-limit violations, stale heads, dismissed approvals, wrong reviewer
identity, skipped or neutral provider checks, workflow privilege boundaries and
exact publication scope. Test the actual enforcing tools, not copies of their
implementation.

Synchronize asynchronous work with observable completion or cancellation.
Do not introduce fixed sleeps, custom test deadlines or delayed cleanup retries.
Close clients, listeners and child processes before removing owned fixtures.
Preserve operation and cleanup errors rather than suppressing either.

Real LCOV measures only the published governance tools. No application behavior,
production service, deployed integration or automatic assistant discovery is
established by these tests. See [validation](validation.md) and
[test reliability](test-reliability.md).
