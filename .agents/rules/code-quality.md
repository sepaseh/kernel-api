# Code quality

## Validate code changes

Use the [validation workflow](../skills/validate-change/SKILL.md) to select
checks and verify the proposed source.

For documentation changes, start with `npm run format:check` and
`npm run check:guidance`. Verify referenced commands against the manifest or
package scripts. Follow the [test selection and validation rules](testing.md#choose-checks)
for code and documentation changes.

## Autofix workflow

Let the configured formatter and import sorter apply their rules to the intended
files. Preserve unrelated work. Use the existing sorter for import order.

- Use only tooling published for this repository. Get user authorization before
  introducing new tooling.
- Use the installed ESLint with `--fix` on the intended files for rules such as
  `eslint-plugin-simple-import-sort`. Verify script availability before using
  `lint:fix` or Knip.

## Readable code over comments

Write self-documenting code. Use comments for non-obvious business logic,
algorithmic decisions the code alone cannot explain, and temporary workarounds
that need context.

## Semantic whitespace

- Use blank lines to mark conceptually distinct parts of the code.
- Leave one blank line after guard clauses before the main execution path.
- Keep consecutive steps of one workflow together, including setup, derived
  values, branching and their related success effects.
- Add a blank line when the code changes responsibility or begins an
  independently meaningful phase. Consider extracting a focused helper when
  one function has many such phases.
- Apply the same grouping to changed functions, helpers and tests. Arrange,
  act and assert are common test phases. Check the grouping directly alongside
  formatter results.
- Keep consecutive request steps together, such as setting the busy flag,
  awaiting the request and applying its result. Keep changes within the affected
  scope and use the existing padding rules.

## Ordering without behavior changes

Use stable alphabetical ordering for object/type fields and named exports only
where order has no meaning. Preserve declared array order, the supported-language
response order, object spread/computed-property evaluation and operation/transaction
sequencing. Let the existing import sorter handle imports. Do not churn unrelated
files or reorder independent-looking work without checking dependencies.

## Simplicity

- Solve the current task directly and avoid speculative abstractions.
- Keep starter-kit code generic and easy to replace.
- Keep error handling focused on reachable failures.
- Prefer straightforward repetition over premature abstraction.

## Static-analysis findings

- Review each SonarQube finding in its runtime context and identify the risk
  before editing.
- Prefer the simplest idiomatic correction that preserves readability, cohesion
  and type safety.
- Avoid wrappers, adapters, `bind` calls, indirection, duplicated state,
  placeholder branches or speculative abstractions introduced solely to silence
  analysis.
- If a finding appears to be a false positive, explain the evidence. Do not
  suppress findings or alter quality rules merely to pass a gate. Follow the
  [Sonar preflight](pull-requests.md#coderabbit-request-preflight) and require
  explicit authorization for classification changes.
- Rerun the analyzer when available and review the resulting code on its own
  merits. Preserve maintainability when resolving a quality gate failure.

## No unused code

Remove demonstrably unused files, exports, dependencies, translations and routes
within scope. Verify cleanup with the affected checks in the
[validation manifest](../validation.json).
