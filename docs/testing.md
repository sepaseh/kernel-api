# API testing

The [publication inventory](../.github/bootstrap-policy.json) declares what is
actually published. The [canonical manifest](../.agents/validation.json) owns all
required source-phase checks. Run its entire full profile on the exact proposed
tree before an authorized commit or PR.

Use pure tests with synthetic feature ports for application policy and operation
ordering. Publish real owned temporary database, authentication, filesystem,
object-storage and HTTP tests with each corresponding adapter. Fake ports and
governance tests cannot establish those behaviors.

The manifest separates Unit tests, API integration tests and Governance tests.
Unit tests use synthetic ports for application policy and isolated module
behavior. API integration tests exercise owned database, authentication,
filesystem, signed object-storage SDK, HTTP, process and recovery boundaries.
Governance tests cover repository controls, tooling, hooks, collection integrity
and synthetic operations. Collection suites also compare saved responses with
in-process Hono routes using synthetic dependencies. Select the actual behavior
owner when assigning a new test, and keep each test in exactly one suite.

Each suite emits measured LCOV and raw V8 coverage. The audit helper retains its
own measurements within Governance. The coverage summary combines the verified
raw non-audit measurements and enforces the original 80% line, branch and
function minimums. It independently enforces those same
minimums for the audit helper before publishing the combined LCOV. Use the pinned
Node runtime; changes to its native coverage interfaces require matching merger
and regression updates. [Validation](validation.md) describes artifact identity
and rerun responsibilities.

Cover exact publication scope, native protection requirements, CodeQL triggers
and query settings, minimal upload permissions, workflow privilege boundaries and
coverage provenance. Use synthetic inputs to reject missing or stale source
evidence and altered reports. Test the actual enforcing tools, not copies of
their implementation.

Current services/catalog tests cover policy, validation, operation ordering,
complete vocabulary, interpolation placeholders, literal catalog data and
canonical object identity. Keep the supported-language contract authoritative.
The i18n suite also exercises real engine resolution and interpolation.

Test semantic errors, authorization, reference conflicts, rollback, concurrent
updates and failure/cleanup behavior at the owning boundary. Synchronize work by
observable completion or cancellation, never fixed sleeps or delayed retries.
Close streams, clients, listeners and subprocesses before removing owned fixtures;
preserve both operation and cleanup failures.

Measured LCOV covers published production owners and excludes test fixtures
from its totals. The full profile includes the recovery drill and synthetic
deployment tests. Native and Docker smoke commands require explicit selection
and their real platform prerequisites. Never read real environments,
credentials, databases, uploads or other checkouts as fixtures. Report actual
results in chat; see [validation](validation.md) and
[test reliability](test-reliability.md).
