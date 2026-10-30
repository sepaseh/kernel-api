# API guidance

Start with [AGENTS.md](../AGENTS.md) and [source navigation](../docs/source-navigation.md).
Read only rules matching the change. The machine-readable index is
[settings.json](settings.json); [validation.json](validation.json) owns check commands
and profiles. Run the smallest useful check during development and the complete
full profile before a requested commit or push. Commit and push require explicit authorization.
Preserve unrelated local state and do not read real environment files or user data.

Assistant instructions, rules, skills and active evaluation prompts are English-only.
Human documentation keeps its English/Persian versions separately; do not add
Persian assistant-guide or evaluation-prompt copies to this repository. The rules
and skills describe assistant-neutral workflows; they are not runtime dependencies.
The evaluation cases are prompts, not evidence that an assistant or production
system has been evaluated.

Use [Git workflow](rules/git.md) for issue, branch, commit, pull-request or review
work. Policy belongs in canonical rules; the `start-issue`, `commit`, `create-issue`,
`create-pr`, `review-pr` and `validate-change` skills describe the matching workflows.
Read [API collection](rules/api-collection.md), [data lifecycle](rules/data-lifecycle.md)
and [collection quality](rules/collection-quality.md) for contract changes.
Optional hooks are host-dependent fast helpers; their presence does not install
them or replace the full gate before an authorized commit or PR. The safety guard
checks selected textual patterns and is not a complete security boundary. Hook
files alone do not establish that a host has installed or invoked them.
