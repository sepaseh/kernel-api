# Collection quality

Follow the [published scope](../README.md#published-scope) and
[collection conventions](api-collection.md#wire-and-example-conventions).

## Validate changes

- Parse changed JSON.
- Search maintained source, examples and tests for old field names after renames.
  Exclude ignored operator state, dependencies and generated output.
- Parse changed request `body:json` blocks. For contract-wide changes, parse all
  JSON files.
- Check Bruno template variables against the documented environment values.
- Review request scripts after response-field changes.
- Check the affected surfaces listed under [Change a contract](api-collection.md#change-a-contract)
  for agreement.
- Trace saved errors to the actual failure path, serializer and selected-language
  catalog or verify them with a synthetic fixture.

## Review scope

- Limit endpoints and examples to the requested contract change.
- Preserve intentional user removals. Report a relevant inconsistency separately
  when it is outside scope instead of recreating removed examples or mass-cleaning
  unrelated operations.
