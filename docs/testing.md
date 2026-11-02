# Governance testing

Test observable policy failures using synthetic GitHub responses and owned
temporary fixtures. Never read real tokens, environments, databases, uploads or
other checkouts as fixtures.

Cover exact publication scope, native protection requirements, CodeQL triggers
and query settings, minimal upload permissions, workflow privilege boundaries and
coverage provenance. Use synthetic inputs to reject missing or stale source
evidence and altered reports. Test the actual enforcing tools, not copies of
their implementation.

Synchronize asynchronous work with observable completion or cancellation.
Do not introduce fixed sleeps, custom test deadlines or delayed cleanup retries.
Close clients, listeners and child processes before removing owned fixtures.
Preserve operation and cleanup errors rather than suppressing either.

Real LCOV measures only the published governance tools. No application behavior,
production service, deployed integration or automatic assistant discovery is
established by these tests. See [validation](validation.md) and
[test reliability](test-reliability.md).
