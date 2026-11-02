# Architecture and publication scope

The published governance phase contains rules, assistant workflows, GitHub,
CodeRabbit and Sonar configuration, and the small scripts that validate these
controls. The [inventory](../.github/bootstrap-policy.json) is authoritative.
`applicationReady` remains false.

No application source, wire contracts, database schema, migrations, translation
catalogs, storage adapters, HTTP listener or deployment assets are published in
this phase. Governance coverage measures its own scripts, not unpublished code.

For later API PRs, preserve one standalone project. The API owns database access,
migrations, authentication and storage. Framework-free application services depend
on feature ports, concrete infrastructure implements them, and thin Hono routes
adapt HTTP. Compose dependencies manually and keep transaction boundaries atomic.
Independent frontends communicate through HTTP.

The [backend](../.agents/rules/backend.md),
[data lifecycle](../.agents/rules/data-lifecycle.md) and
[localization](../.agents/rules/localization.md) rules define constraints for that
future work. Their presence does not prove implementation or deployment.
