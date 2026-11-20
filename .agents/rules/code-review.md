# Code review

Read the pull-request description, complete diff, owning source and relevant
tests. Gather current-head evidence using the
[review workflow](../skills/review-pr/SKILL.md).

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

For API changes, read linked acceptance criteria, owning transactions and current
response examples. Check collection alignment and compatibility with independently
released HTTP consumers. A hidden client action does not prove API authorization.

## Review evidence and authorization

Report local tests, hosted checks, provider analysis and substantive current-head
approval as distinct results. Follow the
[provider requirements](pull-requests.md#provider-evidence-and-required-checks)
and the [CodeRabbit request preflight](pull-requests.md#coderabbit-request-preflight).

Follow [Git authorization](git.md#authorization) before submitting comments or
reviews, resolving conversations or merging.

## Address review feedback

1. Read the review thread and its current status. Verify the finding against the
   latest published PR head, the owning source and the relevant tests.
2. Record the disposition. State what changed and which check verified it, or
   explain why the finding is already addressed or does not apply. Identify the
   published revision when it helps the reviewer verify the result.
3. When authorized to reply, respond in the original review thread. Follow the
   [remote action rules](safety.md#external-systems) for replies, conversation
   resolution and re-review requests. Leave unresolved findings visible.
