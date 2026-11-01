---
name: create-pr
description: Prepare or create a focused Kernel pull request.
---

# Create a pull request

Read `.agents/rules/git.md`, `.agents/rules/pull-requests.md`,
`.agents/rules/commits.md`, and `.agents/rules/safety.md`. Use
`validate-change` for the readiness gate.

1. Confirm the repository, verified head/base branches under the branch policy,
   related issue and whether the task is preparation-only or authorizes creation.
2. Review the complete diff and commits against the base branch; exclude unrelated or generated changes.
   Target 80 or fewer initial GitHub changed-file entries; the hard CI maximum
   remains 100, leaving 20 entries for review fixes.
3. Run the complete gate required by `CONTRIBUTING.md`.
4. Draft a Conventional Commit title and explain the problem, approach, verification, and limitations.
5. If publication requires pushing, confirm that authorization is present; do not
   infer it from a draft request or ask again when already granted. Create or mark
   ready a remote PR only when authorized; disclose missing work/checks and use a
   draft while incomplete. Do not merge, select reviewers or modify issue metadata
   without authorization for that action.
6. Before requesting CodeRabbit, follow the
   [CodeRabbit preflight](../../rules/pull-requests.md#before-requesting-coderabbit).
   Every required non-CodeRabbit check, Sonar scanner and actual quality gate must
   pass for the current head, and the complete latest applicable Sonar PR/branch
   report must have zero open/unresolved issues across all severities and existing
   code. A new commit invalidates this evidence. Missing, skipped or pending
   results block the request. Respect quotas and one in-flight request per head;
   do not bypass this order with an automatic trigger or a documented waiver.
