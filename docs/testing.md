# API testing

The [publication inventory](../.github/bootstrap-policy.json) declares what is
actually published. The [canonical manifest](../.agents/validation.json) owns all
ten real source-phase checks. Run its entire full profile on the exact proposed
tree before an authorized commit or PR.

Use pure tests with synthetic feature ports for application policy and operation
ordering. Publish real owned temporary database, authentication, filesystem,
object-storage and HTTP tests with each corresponding adapter. Fake ports and
governance tests cannot establish those behaviors.

Current services/catalog tests cover policy, validation, operation ordering,
complete vocabulary, interpolation placeholders, literal catalog data and
canonical object identity. Keep the supported-language contract authoritative.
Runtime engine resolution and interpolation need real engine tests when published.

Test semantic errors, authorization, reference conflicts, rollback, concurrent
updates and failure/cleanup behavior at the owning boundary. Synchronize work by
observable completion or cancellation, never fixed sleeps or delayed retries.
Close streams, clients, listeners and subprocesses before removing owned fixtures;
preserve both operation and cleanup failures.

Measured LCOV covers only published production owners. Test fixtures and optional
Docker/native smoke commands are not production sources and are not executed
implicitly by the full profile. Never read real environments, credentials,
databases, uploads or other checkouts as fixtures. Report actual results in chat;
see [validation](validation.md) and [test reliability](test-reliability.md).
