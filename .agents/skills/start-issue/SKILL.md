---
name: start-issue
description: Begin implementation of an existing Kernel issue when asked to work on it, loading verified context, acceptance criteria, source owners and branch state.
---

# Start an issue

Use this workflow when the user asks to begin implementing an existing issue.
Follow the [Git workflow](../../rules/git.md) and [issue rules](../../rules/issues.md).

1. Confirm the repository and issue identifier. Read supplied and local context
   and authorized remote metadata. Mark unavailable facts as unknown, including
   issue state, labels, comments and dependencies.
2. Separate observed facts, assumptions and unknowns. Verify the issue against
   current source. Use the task map in the [assistant guidance index](../../README.md)
   to locate owners and tests. Identify objective acceptance criteria and a
   proportionate plan.
3. Clarify missing decisions that materially change implementation. Report a
   duplicate or already-resolved issue and stay within the requested scope.
4. Apply the [working-checkout rule](../../rules/branches.md#working-checkout)
   before reusing a branch or establishing a verified base and name for a new one.
5. Implement the requested scope and use the
   [validation workflow](../validate-change/SKILL.md) for relevant checks. Report
   the branch, evidence, completed work and remaining uncertainty. Follow the
   [Git workflow](../../rules/git.md) and
   [remote action rules](../../rules/safety.md#external-systems) for follow-up actions.
