---
name: commit
description: Prepare a coherent Kernel commit or create it when explicitly requested, including scope, final-tree checks and staged-diff review.
---

# Commit changes

Honor explicit authorization and preferences already provided in the conversation;
a commit request includes staging its reviewed scope, without another confirmation.
Read [Git workflow](../../rules/git.md), [commits](../../rules/commits.md) and
[safety](../../rules/safety.md). Use [validate-change](../validate-change/SKILL.md)
for checks; the canonical full profile is required before an authorized commit.

1. Inspect branch state, status, working-tree and staged diffs, and relevant
   history when available. Identify pre-existing/unrelated work and an unborn
   repository before deciding what belongs in the commit.
2. Define one coherent scope. Preserve unrelated changes, including an existing
   index; do not silently unstage, discard or include them to simplify the task.
3. For readiness-only work, select proportionate checks through validate-change.
   Before an explicitly authorized commit, run `npm run validate -- full` on the
   exact isolated proposed snapshot. Resolve failures within scope and reverify; do not commit with an
   unresolved required failure or unavailable gate.
4. Stage only when staging or the commit itself is explicitly authorized. Use
   explicit paths and inspect the staged diff for accidental files, secrets,
   generated output and unrelated edits.
5. Derive the subject/body from the commit rule. For preparation or message-only
   requests, return the scope and proposed message without staging or committing
   unless those actions were also requested.
6. Create the commit only when explicitly requested and report its hash/subject.
   Do not infer authorization to amend, rewrite history, push or add attribution.
