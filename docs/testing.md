# Foundation and tooling tests

Test observable policy failures using synthetic GitHub responses and owned
temporary fixtures. Never read real tokens, environments, databases, uploads or
other checkouts as fixtures.

Cover exact publication scope, native protection requirements, CodeQL triggers
and query settings, minimal upload permissions, workflow privilege boundaries and
coverage provenance. Use synthetic inputs to reject missing or stale source
evidence and altered reports. Test the actual enforcing tools, not copies of
their implementation.

The two foundation suites exercise authorization requirements, semantic errors,
unique internal identities, canonical permission and locale metadata, and shared
string/profile bounds. These are pure source tests. Source-boundary checks,
typechecking and lint exercise the published import closure; audit-helper tests
cover dependency-audit behavior. Run every required check through the
[full profile](../.agents/validation.json) for the exact proposed inventory.

Synchronize asynchronous work with observable completion or cancellation.
Do not introduce fixed sleeps, custom test deadlines or delayed cleanup retries.
Close clients, listeners and child processes before removing owned fixtures.
Preserve operation and cleanup errors rather than suppressing either.

Real LCOV measures the published foundation modules and tooling actually
executed by those suites. It does not establish application-service, HTTP,
database, authentication adapter or storage behavior. Publish those owners with
their relevant integration tests and synthetic disposable fixtures. No
production service, deployed integration or automatic assistant discovery is
established here. See [validation](validation.md) and
[test reliability](test-reliability.md).
