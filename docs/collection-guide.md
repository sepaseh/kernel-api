# Bruno and HTTP contracts

[English](collection-guide.md) · [فارسی](collection-guide.fa.md)

Open collection/ in Bruno and create a local environment with synthetic values as
described in the [collection setup](../collection/README.md). Each operation directory
contains index.bru with method, path, authentication, input
and contract notes, plus status-named JSON response examples where applicable.
Bodyless successes can omit a JSON example. Saved examples
describe the wire boundary; Hono routes and application services implement it.
Never save live passwords or tokens in the collection.

For an observable change, update the request/notes/examples, the feature-owned
src/contracts types and route/application behavior together. Add focused HTTP
and persistence/authorization tests, update current docs and coordinate affected
consumers. Preserve snake_case fields, statuses and settings-selected response
language; user-entered content is not translated.

Tests establish real fixture state or send invalid input to obtain errors. There
is no mock-status query/header or response-inspection endpoint. Database schema,
storage layout and deployment are implementation/operations contracts, documented
in [architecture](architecture.md), [database](database-schema.md) and
[deployment](deployment.md). Run the relevant HTTP and collection tests, `npm run check:boundaries` and
`npm run validate -- full` before an authorized commit or PR handoff.

## Client screen contract handoff

Use the `http-contract` task in [.agents/navigation.json](../.agents/navigation.json)
when planning a screen that consumes the API. Open the owning Bruno operations,
DTOs, routes, services and tests before proposing requests or UI states. Record
existing behavior separately from a requested contract change; do not invent an
endpoint, permission, field or error to make a design appear complete.

- Identify each method/path, authentication requirement, input/output field,
  optional/nullable/default behavior and success status. Preserve wire snake_case;
  cite the owning operation and source, not just a TypeScript shape.
- Derive field bounds, format checks and failure statuses from application
  validation and HTTP behavior; use [input validation](input-validation.md) and
  [collection rules](../.agents/rules/api-collection.md). Specify pending, success
  and failed-save behavior without claiming a client control enforces server policy.
- Identify public reads, authenticated reads and write permissions separately.
  For list screens, trace the actual filters, sorting, paging defaults/limits and
  response counts in that operation; mark these inapplicable when no list is used.
- Trace session/cookie and forbidden/unauthenticated behavior through the
  `auth-session` task and [session sequence](sequences.md). Preserve the consuming
  frontend's transport/session guards; this API does not choose its components.
- For media, distinguish public URLs from private metadata, allowed upload
  visibility, multipart fields and size/type failures through `deployment`.
  A settings logo uses a public file from `POST /files`; an object key is not proof
  of public readability. See [file service](../src/application/files.ts).
- Use the persisted language object returned by the API, including its direction,
  calendar and public names; do not infer them from a code or visitor preference.
  Follow `active-language` and [localization](localization.md). Component libraries,
  layout, accessibility and visual verification belong to the frontend's own guide.

For a branding/logo/language screen, [settings routes](../src/presentation/http/routes/settings.ts)
expose public `GET /settings` with `Cache-Control: no-store`, authenticated
`GET /languages`, and protected `PUT /settings`. Read the
[settings service](../src/application/settings.ts),
[response DTO](../src/contracts/settings.ts) and
[update operation](../collection/settings/update/index.bru): both complete palettes
are required; logo IDs are optional public-file IDs. This PUT replaces both palettes
and logo selections: preserve the existing `dark_logo.id`/`light_logo.id` as
`dark_logo_id`/`light_logo_id` on unrelated saves, because omitted logo IDs clear
those selections. See the [persistence adapter](../src/infrastructure/persistence/settings.ts).
An ordinary `settings.update`
editor retains branding rights and omits `language_code`; only a system administrator
may change it. An unchanged compatibility input from an ordinary editor is never
written, protecting a concurrent administrator change. Apply returned settings after
success and account for the documented invalid, unauthenticated, forbidden and
missing-language/logo responses. No list/pagination contract is needed for this screen.
