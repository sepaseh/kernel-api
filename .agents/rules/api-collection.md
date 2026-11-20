# HTTP contracts

Follow the [published scope](../README.md#published-scope).

## Change a contract

The API owns observable HTTP behavior through its Bruno collection, feature
DTOs, routes and behavior tests. Establish the contract from the owning source,
tests and explicit user decisions.

- Inspect the related operations and documented synthetic variables. Distinguish
  observed behavior, assumptions and unresolved decisions. Use the
  [local-state rules](safety.md#secrets-and-local-state) when reading configuration.
- Update every affected contract surface in the same change. For a request field,
  response field, default value, validation rule, status code, or endpoint
  behavior change, align operation docs, examples, DTOs, implementation, tests
  and affected guides in the [documentation map](../../docs/README.md).
  Identify compatibility and rollout work for independently released consumers.
  Follow the [working checkout rules](branches.md#working-checkout).
- For deletion, status or assignment changes, trace the owning transaction and
  verify its behavior using the [data lifecycle rules](data-lifecycle.md).

Run the [collection checks](collection-quality.md#validate-changes) after edits.
Each consumer repository owns its HTTP integration evidence.

## Wire and example conventions

- Review request and response behavior together. Omit backend-owned creation
  defaults from frontend requests. Include them in successful responses when
  the resulting domain model requires them.
- Use `snake_case` in wire JSON and query fields. Convert to `camelCase` at the
  transport boundary when the consumer needs it.
- Omit absent optional fields in payloads and examples unless `null` has
  explicit protocol meaning.
- Base changes to fields, envelopes, permissions, errors and status codes on
  verified contract evidence.
- Store operations in lowercase kebab-case folders as `index.bru`, with status-named
  JSON examples beside them. Preserve standard HTTP header names, declared array
  order and meaningful protocol order. Omit success examples for intentionally
  bodyless responses.
- The current application-error serializer returns a selected-language `message`;
  do not add field-error `cause` objects, translation keys or error codes to examples
  unless an authorized wire change implements them. Preserve each endpoint's actual
  date/time, invalid-query/default and optional-field behavior rather than imposing
  one new format or normalization policy across resources.
- `GET /settings` is public and no-store. `GET /languages` requires authentication.
  Preserve the [persisted-language contract](localization.md#response-language)
  in settings examples.
- Prefer concise Purpose, Authentication, Behavior and Response sections in
  operation docs. Describe the actual method, authorization and failure statuses.
- Sort JSON object keys alphabetically only when order has no contract meaning.
- Keep tokens and payloads synthetic. Keep credentials, private endpoints, real
  signed URLs and personal data out of committed fixtures and examples.
