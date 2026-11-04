# Code Quality

## Validate code changes

Run the smallest declared check that covers the files you changed. Before an
authorized commit or PR, run `npm run validate -- full` from the
[validation manifest](../validation.json), including for documentation changes.

The foundation publication defines source-boundary, typecheck and lint commands
alongside measured source/tooling tests. Select the relevant focused checks from
the manifest and package; none replaces the complete full profile. A passing
foundation gate does not validate unpublished HTTP, database, authentication or
storage behavior.

For docs-only development, start with `npm run format:check` and validate links
and referenced commands. Focused checks do not replace the full profile.

## Autofix workflow

- Let the installed ESLint handle import sorting and configured code rules with
  `--fix` on the intended files, preserving unrelated work.
- Do not assume a `lint:fix` script or Knip command exists; use only commands
  declared by the published package and manifest.
- Never sort imports manually if the published ESLint configuration can do it.
- Do not introduce a formatter or new tooling unless the user asks.

## Readable code over comments

Write self-documenting code. Add comments only for:

- Non-obvious business logic
- Algorithmic decisions that are not clear from the code
- Temporary workarounds with context

## Semantic whitespace

- Treat a blank line as a paragraph boundary between conceptually distinct
  parts of the code, not as decoration between individual statements.
- Leave one blank line after guard clauses before the main execution path.
- Keep consecutive steps of one workflow together, including setup, derived
  values, branching, and their related success effects.
- Add a blank line only when the code changes responsibility or begins an
  independently meaningful phase. If a function needs many such phases,
  consider extracting a focused helper instead of adding more visual sections.
- Apply this to changed functions, helpers and tests; arrange/act/assert are useful
  test phases. Review the semantic grouping directly:
  a formatter passing does not prove that phase boundaries are readable.
- Keep consecutive request steps together, such as setting the busy flag,
  awaiting the request and applying its result. Avoid a new padding rule or
  unrelated formatting sweep to enforce a prose convention.

## Ordering without behavior changes

Use stable alphabetical ordering for object/type fields and named exports only
where order has no meaning. Preserve declared array order, the supported-language
response order, object spread/computed-property evaluation and operation/transaction
sequencing. Let the existing import sorter handle imports. Do not churn unrelated
files or reorder independent-looking work without checking dependencies.

## Simplicity

- Solve the current task directly; avoid speculative abstractions.
- Keep starter-kit code generic and easy to replace.
- Do not add error handling for impossible states.
- Prefer straightforward repetition over premature abstraction.

## Static-analysis findings

- Treat SonarQube findings as prompts to improve the design, not targets to
  silence mechanically. Understand the reported risk and its runtime context
  before changing code.
- Prefer the simplest idiomatic correction that leaves the code at least as
  readable, cohesive, and type-safe as before.
- Do not introduce wrappers, adapters, `bind` calls, indirection, duplicated
  state, placeholder branches, or speculative abstractions whose only purpose
  is to make an analyzer stop reporting an issue.
- If a finding appears to be a false positive, explain the evidence. Do not
  suppress findings or alter quality rules merely to pass a gate. Follow the
  Sonar preflight and require explicit authorization for classification changes.
- Re-run the analyzer when available, but also review the resulting code on its
  own merits. A passing quality gate does not justify a maintainability
  regression.

## No unused code

- Remove unused files, exports, dependencies, translations, and routes.
- Verify cleanup using the available checks in the validation manifest. Optional
  tools declared by later application phases do not replace the full profile.
