# Commits

Use Conventional Commit subjects:

```text
<type>[(scope)][!]: <description>
```

Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, and `test`.

- Use a lowercase kebab-case scope only when it adds stable context.
- Use an imperative description without a trailing period.
- Keep the complete subject at 72 characters or fewer.
- Use `!` only for an actual incompatible change.
- Do not commit when a required check fails.
- Do not amend or rewrite history without explicit authorization.
- Add a body for a reason or tradeoff that the diff does not make clear, and a
  verified issue reference when useful. Do not infer release impact from a label.
- Follow the full final-tree gate and staged-scope review in [Git workflow](git.md)
  and the [commit skill](../skills/commit/SKILL.md); this repository has no reduced
  commit-only gate.
