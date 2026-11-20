# Write and maintain tests

Run the smallest test that exercises the changed behavior. Use the
[validation manifest](../.agents/validation.json) to select related checks.
Before an authorized commit or PR, run the full profile as described in
[validation](validation.md).
The [publication inventory](../.github/bootstrap-policy.json) declares what is
published. Install dependencies with `npm ci` using the
[pinned Node.js version](../.nvmrc).

## Choose a suite

Use pure tests with synthetic feature ports for application policy and operation
ordering. Publish real owned temporary database, authentication, filesystem,
object-storage and HTTP tests with each corresponding adapter. Fake ports and
governance tests cannot establish those behaviors.

| Command                    | When to use it                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`        | Application policy with synthetic ports or isolated module behavior.                                      |
| `npm run test:integration` | Disposable database, authentication, filesystem, signed storage SDK, HTTP, process and recovery behavior. |
| `npm run test:governance`  | Repository controls, tooling, hooks, collection integrity and synthetic operations.                       |

Collection suites also compare saved responses with in-process Hono routes
using synthetic dependencies. Assign each new test to one suite based on the
behavior it exercises. See [test placement](../.agents/rules/testing.md#test-placement).

The integration suites cover settings and file management, category and content
management, and FAQ permissions, validation and ordering. For a focused run
during development, pass the relevant test file to Node directly:

```sh
node --test src/test/integration/faqs-http.test.ts
```

See [source navigation](source-navigation.md) for the owner and related suites.

## Interpret coverage

Each suite emits measured LCOV and raw V8 coverage. The audit helper retains its
own measurements within Governance. The coverage summary combines the verified
raw non-audit measurements and enforces the original 80% line, branch and
function minimums. It independently enforces those same
minimums for the audit helper before publishing the combined LCOV. Use the pinned
Node runtime; changes to its native coverage interfaces require matching merger
and regression updates. [Validation](validation.md) describes artifact identity
and rerun responsibilities.

## Test behavior at the owning boundary

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
