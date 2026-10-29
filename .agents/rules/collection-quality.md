# Collection quality

## Validate changes

- Parse every changed JSON file; for contract-wide changes, parse all JSON files.
- Search for obsolete field names after renames.
- Check Bruno template variables against the documented environment values.
- Review request scripts after response-field changes.
- Confirm collection examples, backend behavior, tests, and documentation
  describe the same behavior.
- Derive saved errors from the actual failure path, serializer and selected-language
  catalog or a synthetic fixture; do not invent aggregate validation envelopes.
  Verify changed request `body:json` blocks as well as saved JSON response files.

## Scope and readability

- Solve the requested contract change directly; do not add speculative endpoints
  or examples.
- Preserve intentional user removals. Report a relevant inconsistency separately
  when it is outside scope instead of recreating removed examples or mass-cleaning
  unrelated operations.
- Keep payloads realistic but non-sensitive.
- Prefer concise Purpose, Authentication, Behavior and Response sections in request
  documentation; describe the actual method, authorization and failure statuses.
- Keep JSON response examples and `body:json` blocks valid. Sort object keys
  alphabetically when order has no contract meaning; preserve array order.
