# API translation catalogs

Follow the [published scope](../README.md#published-scope).

## Message ownership

Store API messages in `src/infrastructure/localization/catalogs/<code>.ts`.
[The catalog index](../../src/infrastructure/localization/catalogs/index.ts)
registers one catalog per `LocaleCode` from
[`supportedLanguages`](../../src/contracts/locales.ts). This list owns the
language codes, directions, calendars, names and public settings order. Settings
uses it directly.

When adding or retiring a message, update the
[application message types](../../src/application/localization.ts) and every
registered catalog together.

Keep message keys and placeholders consistent across all catalogs. Give every
key a genuine, nonempty translation in each supported language.
Preserve i18next `{{variable}}` placeholders. Keep English fallback copies,
English spreads and duplicate aliases out of the catalogs. Language metadata changes alone leave message keys intact.
The [catalog tests](../../src/infrastructure/localization/catalogs.test.ts)
check parity, data purity and consistency with the language list and settings.
Consume runtime catalogs only in infrastructure. Catalogs contain plain message
data and use erased application message types. Follow the
[type import rules](imports.md#erased-type-imports-and-exports).
Only the [translation adapter](../../src/infrastructure/localization/i18n.ts)
initializes i18next. Frontend repositories own their UI, shared and calendar
messages.

## Response language

Persisted API settings select the response language. Fresh settings default to
English. Preserve existing values and ignore request locale headers, cookies and
query parameters. Only a system administrator may change the persisted language.
The persisted language record supplies authoritative direction, calendar and
names. Changing the single system-wide setting leaves stored user content
intact.

Editors with `settings.update` retain branding rights and omit the optional
`language_code` request field. Their writes must omit the language column even
when the API accepts an explicitly unchanged value. This preserves concurrent
system-administrator changes.

An unsupported stored language resolves to English for translation and
`Content-Language`. The fallback preserves the stored value. Public settings
validation rejects the invalid value. A system administrator can use the
authorized update path to repair it. The website owns its explicit-error policy.

## Verify a change

Choose [focused checks](testing.md#choose-checks) for a locale change, including
typechecking and affected application or HTTP tests. This command checks
catalog and engine behavior.

```sh
node --test src/infrastructure/localization/catalogs.test.ts src/infrastructure/localization/i18n.test.ts
```

When language changes affect the wire, follow the
[HTTP contract workflow](api-collection.md#change-a-contract). See the
[localization guide](../../docs/localization.md).
