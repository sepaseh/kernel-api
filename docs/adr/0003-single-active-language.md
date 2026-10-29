# ADR 0003: One persisted active language

[English](0003-single-active-language.md) · [فارسی](0003-single-active-language.fa.md)

Status: accepted. Persisted API settings select one language. Fresh settings use
English and existing values are preserved. All ten local catalogs support that
choice; request headers, cookies, query parameters and URL language prefixes
cannot override it. Only system administrators may change that persisted setting.
Settings editors retain theme/logo rights, with an optional language_code input.
Ordinary saves always omit the language column, including compatible explicitly
unchanged input, so concurrent system-administrator changes survive.

An unsupported persisted code resolves to English for API messages and
Content-Language without rewriting state. Public GET /settings rejects invalid
language metadata; a system-administrator update can repair it. Consumers validate
that public DTO according to their own requirements.

See [settings](../../src/application/settings.ts) and [localization](../localization.md).
