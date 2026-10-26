# Kernel API application-service instructions

Read [README](README.md), [Contributing](CONTRIBUTING.md), the current
[publication inventory](.github/bootstrap-policy.json) and the canonical
[validation manifest](.agents/validation.json) before changes.

This standalone npm project publishes pure HTTP contracts, application primitives,
feature services and ports in the application-services phase. Keep dependencies
local and framework free; read [architecture](docs/architecture.md). The HTTP
server, database and concrete adapters belong to later reviewed phases. Keep
applicationReady false; pure fake-port tests do not establish runtime readiness.
Soft deletion is prohibited: business references must block hard deletion with a
semantic conflict, without partial effects. Future HTTP adapters map that conflict
to a localized 409; future persistence adapters must enforce atomic invariants.

Run `npm run validate -- full` before an authorized commit or PR. Test the exact
proposed tree. Keep each PR at 100 or fewer changed files, including deletions and
renames; the total repository may grow beyond 100 files. Preserve private state,
never read real environment files or credentials, and require explicit user
authorization for commits, pushes, remote comments and merging.

Every PR, including drafts and documentation-only changes, runs all nine required
checks for the published application-services snapshot through that same full
profile. Keep the semantic CI policy check: no PR path/branch filters, conditional
or advisory full execution, hidden command omissions or implicit runner/job
transitions. A focused development profile cannot replace the full PR gate.

Use ordinary CodeRabbit, SonarQube Cloud and CI checks. Before any CodeRabbit
request or re-review, enforce the
[preflight](docs/sonarqube.md#before-requesting-coderabbit): all current-head required
non-CodeRabbit checks, Sonar scanner and actual quality gate must pass, with zero
open/unresolved Sonar issues at every severity. A new commit invalidates evidence;
missing, pending or skipped results block requests. Respect quotas and one
in-flight request per head; never bypass the order with automatic triggers.
Verify that at least one hour has elapsed since the latest CodeRabbit review
before a new request; keep an in-flight request pending rather than duplicating it.

Keep assistant guidance in English and maintained human documentation in English
and Persian. Runnable API
publication must add its complete HTTP, database, authentication, storage and
architecture validation before declaring application readiness.
