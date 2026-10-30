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

## System-wide language authority

Active language is a single system setting, not an account preference. Only an
account with is_system_admin=true can change it. A role containing settings.update
continues to authorize theme/logo saves, without granting language administration.

language_code in PUT /settings is optional. Ordinary callers should omit it. An
explicit current code is accepted for compatibility, but the service always removes
that field from their persistence update. This prevents an ordinary branding save
from overwriting a concurrent system-administrator language change. A changed
code is forbidden before any settings write. System administrators may supply a
registered code or omit it to retain the persisted value. Complete palettes and
public-logo validation keep their existing rules.
