# Code review

Review the pull-request description, complete diff, and relevant tests before
judging a change. Passing automation is evidence, not proof.

## Priorities

- `P0`: immediate security exposure, irreversible data loss, or system-wide outage.
- `P1`: likely serious regression, authorization failure, or broken critical workflow.
- `P2`: localized correctness, reliability, accessibility, performance, or maintainability defect.
- `P3`: low-risk improvement worth addressing but not blocking the change.

## Findings

Lead with actionable findings ordered by priority. Each finding includes a tight
file and line location, failure scenario, impact, reason the diff permits it,
and a concise fix direction. Keep questions and suggestions separate from
defects.

Do not turn tool-enforced style, hypothetical future risk or unrelated old code
into a finding. Assess phase spacing in changed functions using
[code quality](code-quality.md); keep non-blocking readability suggestions
separate from concrete behavioral defects.

Check affected behavior, security, local HTTP-contract alignment, state lifecycle,
failure-path tests, accessibility, localization, visible UI evidence, and the
documentation map. If no finding remains, say so and disclose checks not run.

Local tests, hosted checks, provider analysis and substantive current-head approval
are separate evidence. Follow [review preflight](pull-requests.md#coderabbit-request-preflight);
skipped or conversational provider replies do not establish a completed review.
Submit remote comments or reviews, resolve conversations and merge only with
authorization for the corresponding action.

For API changes, read linked acceptance criteria, owning transactions and current
response examples. Check collection alignment and compatibility with independently
released HTTP consumers. A hidden client action does not prove API authorization.
