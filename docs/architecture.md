# Application architecture

[English](architecture.md) · [فارسی](architecture.fa.md)

The current [application-services phase](bootstrap.md) is a framework-free
application layer with local contracts and feature-specific dependency ports.
`applicationReady:false` is deliberate: there is no HTTP server, composition
root, database schema, migration or concrete adapter in this snapshot.

## Ownership and dependencies

`src/contracts` owns pure wire definitions and constants. Application services
under `src/application` consume those definitions, core validation/errors/models
and the ports under `src/application/ports`. Imports stay within this checkout;
there is no workspace or shared-package dependency.

Application services never import framework, ORM, authentication/storage SDK or
HTTP request/response types. The localization module supplies erased message-key
types; runtime translations and HTTP status mapping belong to future adapters.
`scripts/check-boundaries.mjs` checks source containment, local dependency
resolution, contract purity and forbidden application dependencies. The exact
publication guard separately rejects undeclared source and runnable layers.

| Service       | Responsibility                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account.ts`  | Account serialization, profile/username validation and email-verification ordering through account/OTP ports.                                                                     |
| `auth.ts`     | Session-to-actor checks, credential/OTP use cases and password-change ordering. Explicit provider rejections become semantic validation errors; outages remain ordinary failures. |
| `calendar.ts` | Calendar-date validation and repository operations.                                                                                                                               |
| `files.ts`    | Upload validation, public-upload permission, object/metadata sequencing, public-read isolation and compensating object cleanup.                                                   |
| `roles.ts`    | Role validation, permission deduplication and assigned-role deletion conflicts.                                                                                                   |
| `settings.ts` | Public branding/language serialization, settings-update authorization and system-administrator language authority.                                                                |
| `users.ts`    | User validation/pagination, role assignment, credential/status operations and self/final-administrator deletion protection.                                                       |

Several administrative services expect authorization at the future HTTP
boundary rather than accepting an actor for every method. A service method's
presence does not make an endpoint or establish transport authorization. The
future composition root must inject concrete adapters and the transport must
perform the required authentication/permission checks.

## Language and deletion policies

The supported-language metadata in `src/contracts/locales.ts` owns codes,
direction, calendar and public names. Settings expose that metadata with the
persisted active language. Only a system administrator can change the active
language; ordinary permitted branding saves do not overwrite a concurrent
language change. Frontends consume API settings rather than persisting an
independent user language choice.

Soft deletion is prohibited. Role deletion uses the port's atomic
`deleteIfUnassigned` result and reports a semantic conflict when assigned. User
deletion re-reads state through its transaction port, protects self/final active
administrator and reports a conflict for a record still in business use.
Dependents must be resolved first; do not silently unlink them or cascade away
business records. Future HTTP mapping must return a localized 409 for conflicts.
Future persistence adapters must enforce reference checks, allowed technical
cleanup and writes atomically. These requirements are not proof of a database
implementation in this phase.

## Test evidence and remaining integration

Pure application tests inject small synthetic fake ports. They exercise policy,
semantic errors, dependency calls and observable ordering. File tests cover
compensating cleanup and preservation of the original metadata failure even if
cleanup also fails. User tests verify transaction-port policy against the state
read inside the callback; they do not prove database isolation or rollback.

Before runnable publication, add concrete HTTP/auth/persistence/storage adapters,
manual composition and full HTTP contract, permission, session/cookie,
translation, transaction/concurrency, OTP and storage integration tests using
fresh disposable fixtures. The file-size check occurs after the boundary has
provided an upload source; it is not a bounded pre-parse HTTP stream guarantee.

The [canonical full gate](../.agents/validation.json) validates only the published
scope and produces actual coverage from this checkout. Preserve that evidence's
limits and the [current-head Sonar/CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit)
when publishing each focused PR.
