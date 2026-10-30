# API translation catalogs

API messages belong to src/infrastructure/localization/catalogs/<code>.ts. The local
index composes all ten codes from supportedLanguages in src/contracts/locales.ts.
This pure metadata list owns codes, direction, calendar and public names in the public
settings order; settings consume it directly and LocaleCode derives from it. Do not
maintain a second codes/directions registry. Keep genuine, nonempty,
complete key sets and i18next {{variable}} parity in every registered language.
Do not use English spreads, copied fallback catalogs, duplicate aliases or blank values.
Frontend UI/common/calendar catalogs belong to their independent frontend repositories.

src/application/localization.ts defines the pure message-key/resource types without
reading runtime catalogs. Application imports from it must be erased type references.
When adding or retiring a message, update this vocabulary and all ten catalogs together;
src/catalogs.test.ts checks exact parity, data purity and registry/settings consistency.
Only infrastructure/localization/i18n.ts initializes i18next.

Persisted API settings select response language. Fresh settings default to English;
preserve existing values. Request headers/cookies/query cannot override it. Only
isSystemAdmin may change the persisted language. Keep settings.update branding
rights: language_code is optional, and ordinary saves must always omit the language
column, including accepted explicitly unchanged codes. This protects concurrent
system-administrator changes; compare-only authorization is insufficient. Unsupported
codes resolve to English for translation and Content-Language without rewriting state;
the public settings DTO still rejects invalid language. System-administrator repair is
separate. The website's explicit-error policy belongs to its own HTTP consumer.

Run relevant localization and application/HTTP tests and typecheck for a locale change.
`npm run test:i18n` is a focused check and does not replace the full profile.
Each repository owns its messages independently; assess public wire compatibility when
releasing changes. See [Localization](../../docs/localization.md).
