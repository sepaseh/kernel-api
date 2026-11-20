# Bruno and HTTP contracts

The API-owned Bruno collection records requests and response examples for the
published HTTP features. The publication inventory explicitly declares the
available `collectionGroups`; feature suites verify those saved contracts
against the owning routes and DTOs.

Open `collection/` in Bruno with a synthetic local environment; follow the
[collection setup guide](../collection/README.md).

## Change an HTTP contract

Operations use `index.bru` for method, path, authentication, input and contract
notes, with status-named JSON examples where applicable. Bodyless successes may
omit a JSON example. Hono routes and application services implement the wire
boundary; never save live passwords or tokens in shared examples.

For an observable change, update every published request/notes/example, the feature-owned
src/contracts types and route/application behavior together. Add focused HTTP
and persistence/authorization tests, update current docs and coordinate affected
consumers. Preserve snake_case fields, statuses and settings-selected response
language; user-entered content is not translated.

Tests establish real fixture state or send invalid input to obtain errors. There
is no mock-status query/header or response-inspection endpoint. Database schema,
storage layout and deployment are implementation/operations contracts, documented
in [architecture](architecture.md), [database](database-schema.md) and
[deployment](deployment.md). Run the relevant HTTP and published collection
tests and `npm run check:boundaries`. Follow the
[validation guide](validation.md) before an authorized commit or PR.

## Rich-text content

[Create](../collection/contents/create/index.bru) and
[update](../collection/contents/update/index.bru) both require `title`,
`excerpt`, `body`, `content_category_id` and `cover_image_id`. A PATCH
replaces all editable fields. If the category or public cover is unavailable,
the request returns 404 and preserves the existing content. Use the normalized
`body` returned from a successful save to update the editor.

The [server sanitizer](../src/infrastructure/content/rich-text.ts) preserves
paragraphs, headings, block quotes, breaks, bold, italic, underline, and
ordered and unordered lists. A list item may keep `data-list="bullet"` or
`data-list="ordered"`. The sanitizer removes links, images and other
unsupported markup. It discards script, style and other non-text elements
with their contents. A body with no meaningful text after sanitization returns 400. See the [HTTP behavior tests](../src/test/integration/contents-http.test.ts).

## Client screen contract handoff

Use the `http-contract` task in [.agents/navigation.json](../.agents/navigation.json)
when planning a screen that consumes the API. Open the owning DTOs, routes,
services, tests and any published Bruno operations before proposing requests or UI states. Record
existing behavior separately from a requested contract change; do not invent an
endpoint, permission, field or error to make a design appear complete.

- Identify each method/path, authentication requirement, input/output field,
  optional/nullable/default behavior and success status. Preserve wire snake_case;
  cite the route, behavior tests and any published operation, not just a TypeScript shape.
- Derive field bounds, format checks and failure statuses from application
  validation and HTTP behavior; use [input validation](input-validation.md) and
  [collection rules](../.agents/rules/api-collection.md). Specify pending, success
  and failed-save behavior without claiming a client control enforces server policy.
- Identify public reads, authenticated reads and write permissions separately.
  For list screens, trace the actual filters, sorting, paging defaults/limits and
  response counts in that operation; mark these inapplicable when no list is used.
- Trace session/cookie and forbidden/unauthenticated behavior through the
  `database-auth` and `http-contract` tasks and [session sequence](sequences.md). Preserve the consuming
  frontend's transport/session guards; this API does not choose its components.
- For media, identify public URLs, private metadata, upload permissions,
  multipart fields and size/type failures from the
  [upload contexts](object-storage.md#upload-contexts).
  A settings logo uses a public file from `POST /files`; an object key is not proof
  of public readability. See [file service](../src/application/files.ts).
- Use the persisted language object returned by the API, including its direction,
  calendar and public names; do not infer them from a code or visitor preference.
  Trace the settings service and persistence owner with [localization](localization.md). Component libraries,
  layout, accessibility and visual verification belong to the frontend's own guide.

### Settings

For a branding, logo or language screen, the [settings routes](../src/presentation/http/routes/settings.ts)
expose public `GET /settings` with `Cache-Control: no-store`, authenticated
`GET /languages`, and protected `PUT /settings`. Read the
[settings service](../src/application/settings.ts),
[response DTO](../src/contracts/settings.ts), HTTP tests and the
[saved update operation](../collection/settings/update/index.bru). Both complete palettes
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
Settings responses include `image_settings` for `contents` and `logo`. A PUT
without `image_settings` preserves the stored values. To change them, send
both contexts with integer `width` and `height` from 1 to 8,192 and a positive
safe integer `size` in bytes.

### Content and files

`GET /contents` requires `contents.read` and returns `{ items, total }` in
one-based pages of 24. The optional `title` filter matches a literal
case-insensitive substring. The optional `content_category_id` filter matches
an exact ID. When supplied together, both filters apply to the items and total.
Results sort by creation time and then ID. See the
[list operation](../collection/contents/list/index.bru).

The category list supplies filter and editor choices to a caller with
`content-categories.read`, `contents.read`, `contents.create` or
`contents.update`. Upload a cover with multipart `context=contents` and use
the returned ID as `cover_image_id`. Repeat that ID on an edit that keeps the
cover. Use `size` in bytes and `is_used` in the file management list. A category
or file currently in use returns 409 on deletion. See the
[category list](../collection/content-categories/list/index.bru) and
[file management guide](object-storage.md#file-management).

### Content category and FAQ ordering

Lists return entries in saved order. `PATCH /content-categories/sort` requires
`content-categories.update`. `PATCH /faqs/sort` requires `faqs.update`.
Each operation accepts an `ids` array containing every current ID exactly once
in the desired order. A successful sort returns an empty 200. If records were
added or removed since the last read, a stale list returns 409 and preserves the
saved order. Reload the list and submit the revised order. A different ordering
of the same set of IDs can replace the previous order. See the
[category sort](../collection/content-categories/sort/index.bru) and
[FAQ sort](../collection/faqs/sort/index.bru) operations.

### Users

The users screen sends `page` to `GET /users` for one-based pages of 24. Clients
using the existing `offset` and `size` parameters retain variable-size pages.
