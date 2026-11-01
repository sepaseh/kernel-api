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
- Add a body for a non-obvious reason/tradeoff and a verified issue reference when
  useful. A breaking footer describes an actual incompatible change.
- Use the [commit workflow](../skills/commit/SKILL.md) and [Git rule](git.md): review
  the final working/staged scope, run the full canonical gate and stage explicit
  paths. A commit request does not authorize pushing or publishing a pull request.
