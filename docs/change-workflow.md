# Planning an API change

[English](change-workflow.md) · [فارسی](change-workflow.fa.md)

Record the requested behavior, repository owner, affected clients and observable
acceptance cases. Read the relevant contract, service, adapter and tests using
[source navigation](source-navigation.md). Preserve existing local changes and
exclude real credentials and private state from test fixtures.

Describe invalid input, authorization, data consistency and compatibility where
relevant. Identify migrations or rollout dependencies before implementation, then
run focused checks and the required [full validation](validation.md) before an
authorized handoff. Do not claim execution or remote approval that did not occur.

## Change record

Use this record to connect the request to its implementation and verification.
Keep completed records with the local task or an authorized issue or PR; examples
and unexecuted checks are not evidence of completion.

```text
Request, source and date:
Required behavior and explicit exclusions:
Owning repository and affected consumers:
Baseline and source scope, including existing local changes:
Acceptance scenario: trigger, observable result and verification:
Invalid, stale or unauthorized input and expected result:
Dependencies and operator decisions:
Implementation steps and owning files:
Data, migration and HTTP compatibility; rollout and rollback:
Synthetic fixtures and cleanup:
Relevant check IDs or profile from .agents/validation.json:
Observed results, failures and checks not run:
Remaining work and owner:
```

Include transaction, session, privacy or recovery scenarios when relevant. Keep
backend behavior in its owning API and coordinate incompatible HTTP changes with
consumers. Use the validation manifest rather than copying a separate list of
required checks, and update the English and Persian documentation together.

For changes to deletion, status or relationships, consult the [data lifecycle rule](../.agents/rules/data-lifecycle.md) and record how the owning transaction protects dependent records. For an API-backed client screen, use the [client screen contract handoff](collection-guide.md#client-screen-contract-handoff) to separate existing behavior from proposed contract changes.

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
