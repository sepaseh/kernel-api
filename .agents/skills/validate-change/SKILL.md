---
name: validate-change
description: Select and run Kernel checks for a change, including the complete gate at commit and push boundaries.
---

# Validate a change

Read the changed files and relevant rules before selecting checks.

- TypeScript or TSX: run `npm run typecheck`, then `npm run lint`.
- Behavior: run the smallest relevant test first.
- Documentation or guidance: check paths, referenced commands and formatting
  with the available tools.
- HTTP/DTO/Bruno changes: run relevant API and contract tests;
  parse changed JSON/request bodies and follow collection-quality.md.
- Delete/status/relation changes: read data-lifecycle.md and cover its owning
  transaction, failure and session/storage behavior with synthetic fixtures.
- Import/export/dependency changes: include the existing boundary and unused-code
  checks. CI/deployment changes use the relevant checks in the canonical manifest.

Before every commit or push, run the `full` profile of that canonical manifest,
following `docs/validation.md` and `CONTRIBUTING.md`. Never bypass or silently
ignore a failure. Static instruction checks are not a cross-assistant benchmark.
Do not add a fast commit gate or separate command inventory that weakens the full
profile. Fix safe in-scope inconsistencies, then rerun affected checks; report
unresolved failures and unavailable evidence honestly.
