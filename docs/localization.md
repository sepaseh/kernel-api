# Kernel API localization

The API owns ten local message catalogs. `src/contracts/locales.ts` defines the
supported-language metadata; `src/application/localization.ts` defines the erased
application vocabulary, and the infrastructure adapter resolves translations.
Keep catalog keys and interpolation placeholders consistent across languages.

The persisted system language determines response language. Visitor preferences
do not override it. The catalogs translate API messages. User-entered names,
content and FAQ text retain their stored values. Independent applications own
their frontend catalogs.

## Review sensitive translations

Review the meaning of changed translations in the rendered message or API
response. Check that each translation preserves the original action and its
consequence, including negation, irreversibility, permission, expiry and retry
conditions. Check the message in context with representative interpolated
values. Catalog checks verify keys and placeholders. Record the languages
reviewed and any pending linguistic review with the change evidence.

For an OTP rejection, preserve the response's wording that the code is invalid
or expired. For a permission error, preserve that the action is denied.

## System-wide language authority

Only an account with `is_system_admin: true` can change the system language.
A role with `settings.update` authorizes ordinary branding and image-settings
saves.

`language_code` in `PUT /settings` is optional. Ordinary callers should omit it. An
explicit current code is accepted for compatibility, but the service always removes
that field from their persistence update. This prevents an ordinary branding save
from overwriting a concurrent system-administrator language change. A changed
code is forbidden before any settings write. System administrators may supply a
registered code or omit it to retain the persisted value. Complete palettes and
public-logo validation keep their existing rules.

## Reading language metadata

Public `GET /settings` returns the active `language` object. Authenticated
`GET /languages` returns the supported list. Use each object's `direction`,
`calendar`, `name` and `native_name` as supplied by the API. Fresh settings
default to English. If the stored code is unsupported, translation and
`Content-Language` fall back to English. The settings endpoint returns an
error until a system administrator repairs the code.

See [HTTP transport](http-transport.md), the [locale registry](../src/contracts/locales.ts)
and the [catalog integrity tests](../src/infrastructure/localization/catalogs.test.ts).
