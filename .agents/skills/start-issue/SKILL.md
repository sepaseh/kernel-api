---
name: start-issue
description: Begin implementation of an existing Kernel issue when asked to work on it, loading verified context, acceptance criteria, source owners and branch state.
---

# Start an issue

Use this workflow for a request to begin the issue's implementation, not a mere
issue mention or read-only discussion. Read [Git workflow](../../rules/git.md),
[issues](../../rules/issues.md), [branches](../../rules/branches.md) and
[safety](../../rules/safety.md).

1. Confirm the repository and issue identifier. Read supplied/local context and
   authorized remote metadata using available tools. Do not invent issue state,
   labels, comments or dependencies when access is unavailable.
2. Separate observed facts, assumptions and unknowns. Verify the issue against
   current source, locate owners through [source navigation](../../../docs/source-navigation.md),
   and identify objective acceptance criteria and a proportionate plan.
3. Clarify only missing decisions that materially change implementation. A
   duplicate or already-resolved issue is evidence to report, not permission to
   modify issue metadata or broaden the work.
4. Inspect branch/status and preserve unrelated or unborn working-tree state.
   Reuse a matching branch or establish a verified base/name when starting work
   is authorized; do not switch in a way that overwrites user changes.
5. Implement the requested scope and use [validate-change](../validate-change/SKILL.md)
   for relevant checks. Report the branch, evidence, completed work and remaining
   uncertainty. Do not automatically comment, assign, label, change status,
   create a review request, commit or push unless that action is already explicitly
   authorized in the current conversation. Do not ask again for existing authorization.
