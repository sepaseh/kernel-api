# API task navigation

[English](source-navigation.md) · [فارسی](source-navigation.fa.md)

The machine-readable `.agents/navigation.json` is the canonical task map. Start
with root AGENTS, then open only the selected owners, contracts, rules
and tests. Follow complete behavior through transport, application, adapter and
transaction boundaries rather than relying on a symbol match or passing typecheck.

The task map references source files and tests. Run each relevant check before
reporting it as successful; the presence of a file is not evidence that a check ran.

Tasks cover API features, HTTP contracts, auth/session, active language, local
translation catalogs, media storage, deployment/recovery and guidance. Runtime source
lives in `src/`; pure wire DTOs/constants are in feature-owned `src/contracts`
modules, imported directly. `contracts/locales.ts` is the single pure supported-
language metadata source for settings and the catalog code type, with runtime
message catalogs under `src/infrastructure/localization/catalogs`. Public behavior
is evidenced by Bruno, DTOs and actual API tests. Other apps are HTTP consumers in
independent repositories; local contract/catalog source need not be synchronized.

For authentication and sessions, consult [authentication adapters](auth-adapters.md)
and the [security checklist](security/authentication-review.md). For storage and
deletion, consult [object storage](object-storage.md), [database constraints](database-schema.md)
and [HTTP transport](http-transport.md). For deployment and recovery, start with
[deployment](deployment.md) and [backup and restore](backup-restore.md).
For the native smoke lifecycle, inspect the packaging and cleanup owners and their
synthetic failure-path tests listed in the deployment task. Fixture cleanup tests
also cover the ownership and failures of temporary database resources.

The API feature and contract tasks include the [data lifecycle rule](../.agents/rules/data-lifecycle.md)
for delete/status/assignment changes. Issue, branch, commit and review work starts
at [Git workflow](../.agents/rules/git.md), which routes to canonical rules and the
matching skills. Verify branch/base state and preserve unrelated work; the full
validation manifest remains required before an authorized commit or PR.

For an API-backed screen plan, select `http-contract` and complete the
[client screen contract handoff](collection-guide.md#client-screen-contract-handoff).
Follow `auth-session`, `active-language` or `media-storage` when the screen uses
those behaviors. The API provides contracts and authorization/error evidence;
component selection, layout and visual checks belong to the consuming frontend.
Use [contract testing](contract-testing.md), [input validation](input-validation.md),
[request sequences](sequences.md) and [logging](backend-logging.md) to trace the
behavior; the [decision index](adr/README.md) records architectural choices.

Deployment tasks include API-only Docker/native artifacts, immutable packaging,
prevalidation, durable state, health/bootstrap and coordinated recovery. Guidance
and evaluation use only the root project. [Validation](validation.md),
[architecture](architecture.md), [deployment](deployment.md) and
[evaluation](comprehension-evaluation.md) describe their limits. Never use real env,
ignored server/data or production as a comprehension fixture.
