# API localization

[English](localization.md) · [فارسی](localization.fa.md)

The API owns ten local message catalogs. `src/contracts/locales.ts` defines the
supported-language metadata; `src/application/localization.ts` defines the erased
application vocabulary, and the infrastructure adapter resolves translations.
Keep catalog keys and interpolation placeholders consistent across languages.

The persisted system language determines response language. Visitor preferences
do not override it. See [HTTP transport](http-transport.md), [architecture](architecture.md)
and the catalog and HTTP tests before changing this behavior. Frontend catalogs
belong to their independent applications.
