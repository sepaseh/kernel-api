# Commits

## Scope and validation

Keep each commit focused on one coherent change. Inspect the working-tree and
staged diffs. Stage explicit paths for the reviewed scope when authorized.
Review the staged diff to exclude unrelated work, `.env` files, credentials,
build output and local-only settings.

Follow the [commit workflow](../skills/commit/SKILL.md) for scope, validation
and staged-diff review.

Follow the [Git authorization rules](git.md#authorization) for staging.

Follow the [validation policy](../../docs/validation.md) and
[validation procedure](../skills/validate-change/SKILL.md) for the full
final-tree gate. Resolve required failures within scope and rerun the affected
checks. Do not stage or commit while a required check is failing or unavailable.
Follow the [Git rules](git.md#rules) for broad staging and optional hooks.

## Commit message

Use this Conventional Commit format.

```text
<type>[(scope)][!]: <description>
```

Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, and `test`.

- Use a lowercase kebab-case scope only when it adds stable context.
- Use an imperative description without a trailing period.
- Keep the complete subject at 72 characters or fewer.
- Use `!` only for an actual incompatible change.
- Add a body for a reason or tradeoff that the diff does not make clear, and a
  verified issue reference when useful. Do not infer release impact from a label.
- Add AI co-author trailers only at the user's request.
