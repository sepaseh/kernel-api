# Change handoff and implementation plan

[English](change-workflow.md) · [فارسی](change-workflow.fa.md)

Use this handoff for a feature, defect or operational change. It does not add an AI
runtime or require a particular assistant. Keep the filled record with the issue,
PR or local task evidence; creating remote issues or sending messages requires
the owner's authorization.

For historical context, the [2026-10-24 roadmap assessment](qa/roadmap-status-2026-10-24.md)
identifies requirements analysis (F081) and technical planning (F082) as reusable
documented practices; it does not establish outcomes for later work.

## Establish the change contract

- Record the request, its source and date. Mark each item as required, proposed,
  conditional or out of scope. A learning-roadmap topic is not automatically a
  product requirement.
- Name the owning repository and affected HTTP consumers. Contracts and
  catalogs are independently owned local copies. Coordinate observable HTTP
  compatibility when needed; do not impose synchronized catalog edits.
- Read the matching [task navigation](source-navigation.md), owner source,
  contracts, rules and tests. Record current behavior and the concrete failure.
  Include dirty/untracked source in the baseline; exclude real env/state/secrets.
- Write numbered acceptance scenarios before editing: trigger, observable result,
  failure/authorization boundary and verification evidence. Cover relevant session
  races, language/cache/privacy, transactions or recovery as part of that scenario.

## Reusable task record

Copy and fill this record; do not retain example placeholders as completed evidence.

```text
Request/source/date:
Required items and explicit exclusions:
Owner and affected consumers:
Baseline / changed source scope:
R1: Given ... when ... then ...; verify with ...
R2: Invalid/stale/unauthorized ... must ...; verify with ...
Dependencies or operator decisions still needed:
Implementation steps (small, ordered, with owning files):
Data/migration/contract compatibility and rollback:
Synthetic fixtures, resources and cleanup:
Validation IDs/profile from .agents/validation.json:
Manual checks / external services not run:
Observed results, failures and skips:
Remaining recommendations and owner:
```

Prefer the smallest coherent implementation. Keep backend behavior in its owning
API, frontend presentation in its app, and product/provider integrations conditional
on an actual requirement. Add a short ADR when a durable architectural decision
changes. Update the matching English/Persian explanation in the same change.

Use the canonical [validation policy](validation.md) for commands rather than
copying another full gate. Report implemented code, configured workflows, executed
tests and unexecuted manual checks separately. Review failures using
[test reliability](test-reliability.md). Do not claim a manual screen-reader review,
hosted CI, production recovery or an assistant benchmark from source inspection.
Commit, push and production access retain their existing authorization boundaries.
Run the focused checks and the required full validation before an authorized
handoff, and do not claim remote approval that did not occur.

For changes to deletion, status or relationships, consult the [data lifecycle rule](../.agents/rules/data-lifecycle.md) and record how the owning transaction protects dependent records. For an API-backed client screen, use the [client screen contract handoff](collection-guide.md#client-screen-contract-handoff) to separate existing behavior from proposed contract changes.
