# Architecture and publication scope

The current foundation phase contains fifteen pure source files and repository
tooling. The [inventory](../.github/bootstrap-policy.json) is authoritative;
`applicationReady` remains false. The earlier governance publication's rules,
assistant workflows, GitHub controls and provider configuration remain in scope.

The source includes five feature-owned contracts for locale metadata, OTP
concepts, permissions, profile bounds and public-settings language shapes; seven core modules for authorization,
errors, identity, localization vocabulary, models, permissions and validation;
the authentication port definitions required by those modules; and two pure
foundation test suites. Imports remain within this closure and appropriate
native utilities. Do not add unused contracts or ports merely because other
local source refers to them.

Contracts stay pure and have no catch-all barrel. Locale metadata has one local
definition. Application localization vocabulary is type-only; runtime catalogs
and translation engines are not part of this phase. Foundation coverage measures
authorization, identity, permission/locale metadata, semantic errors and string
validation, alongside the repository tools it actually executes.

Application services, runtime catalogs, concrete adapters, migrations, HTTP
routes, a listener and deployment assets remain unpublished. No running API,
production OTP delivery, deployed integration or production readiness follows
from foundation tests.

For later source PRs, preserve one standalone project. The API owns database access,
migrations, authentication and storage. Framework-free application services depend
on feature ports, concrete infrastructure implements them, and thin Hono routes
adapt HTTP. Compose dependencies manually and keep transaction boundaries atomic.
Independent frontends communicate through HTTP.

The [backend](../.agents/rules/backend.md),
[data lifecycle](../.agents/rules/data-lifecycle.md) and
[localization](../.agents/rules/localization.md) rules define constraints for that
owners as they are published. Their presence does not prove implementation or
deployment beyond the declared inventory.
