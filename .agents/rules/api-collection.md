# API collection

- Current owner source, tests and explicit user decisions define behavior. Inspect
  related operations and documented synthetic template variables; keep observed
  facts, assumptions and unresolved decisions separate. Do not infer contracts
  from another application or read populated environment files.
- Maintain `collection/` as the executable HTTP contract alongside its owning
  feature DTO, routes, application behavior and tests, plus the relevant API
  documentation.
- Update every affected contract surface in the same change. A request field,
  response field, default value, validation rule, status code, or endpoint
  behavior change is incomplete until local examples, operation docs, DTOs,
  implementation, affected tests and current documentation agree. Identify
  compatibility/rollout work for affected independently released consumers;
  coordinating HTTP does not authorize editing another checkout.
- Review both request and response examples when changing creation defaults.
  Defaults owned by the backend must not be sent by frontend forms, and must be
  present in successful responses whenever the resulting domain model requires
  them.
- External JSON and query fields use `snake_case`; TypeScript may use
  `camelCase` after conversion at the transport boundary.
- Store operations in lowercase kebab-case folders as `index.bru`, with status-named
  JSON examples beside them. Preserve standard HTTP header names, declared array
  order and meaningful protocol order. Omit success examples for intentionally
  bodyless responses.
- Prefer omission for absent optional fields unless `null` has explicit domain
  meaning.
- Do not invent fields, envelopes, permissions, errors, or status codes without
  authoritative evidence.
- The current application-error serializer returns a selected-language `message`;
  do not add field-error `cause` objects, translation keys or error codes to examples
  unless an authorized wire change implements them. Preserve each endpoint's actual
  date/time, invalid-query/default and optional-field behavior rather than imposing
  one new format or normalization policy across resources.
- `GET /settings` is public and no-store; its persisted language record supplies
  authoritative direction/calendar/names. `GET /languages` requires authentication.
  Only a system administrator changes active language; ordinary settings editors
  retain branding rights and omit `language_code`. Language changes do not rewrite
  stored user content or create individual language preferences.
- Read [data lifecycle](data-lifecycle.md) before changing deletion, status or
  assignment contracts. Soft deletion is prohibited. Deletion with business usage must return
  a localized 409 message asking the caller to resolve dependent records first,
  without deleting or silently unlinking related data. Verify the owning
  transaction and actual implementation, not only the saved example.
- Keep tokens and examples synthetic. Never commit credentials, private
  endpoints, signed URLs, or personal data.
