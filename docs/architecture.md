# Architecture and publication scope

The [inventory](../.github/bootstrap-policy.json) and
[validation manifest](../.agents/validation.json) declare the exact published
phase. `applicationReady` remains false.

The localization-data phase includes pure feature contracts, core policies,
eight feature ports, seven framework-free application services, their synthetic
port tests, and all ten literal API catalogs plus registry and integrity tests.
The earlier governance controls and pure foundation remain published.

Contracts have no catch-all barrel. Locale metadata, permissions, OTP concepts
and profile bounds retain one local definition. Application vocabulary imports
are erased types; application services never load catalogs or a translation
engine. Catalogs contain literal nonempty strings, not executable fallbacks.
The narrowly named Sonar duplication exception covers only their ten data files;
the registry and locale metadata retain duplication analysis, and all source,
rules and measured coverage remain analyzed.

The API owns database access, migrations, authentication and storage. Services
depend on feature ports; concrete infrastructure will implement them. Thin Hono
routes will adapt HTTP, with manual composition and atomic transaction boundaries.
Independent frontends communicate through HTTP.

Current fake-port tests establish application policy and operation ordering,
not real database transactions, authentication persistence, object storage or an
HTTP listener. Those owners and real disposable-fixture tests must be published
together in later PRs. Production OTP delivery, deployed integrations and
production readiness remain outside this scope.

Read [backend](../.agents/rules/backend.md),
[data lifecycle](../.agents/rules/data-lifecycle.md),
[localization](../.agents/rules/localization.md) and
[validation](validation.md) for the owning constraints.
