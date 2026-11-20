---
name: commit
description: Prepare a coherent Kernel commit or create it when explicitly requested, including scope, final-tree checks and staged-diff review.
---

# Commit changes

Follow the [Git workflow](../../rules/git.md) and [commit rules](../../rules/commits.md).

1. Apply the [working-checkout rule](../../rules/branches.md#working-checkout).
   Inspect the branch, status, working-tree and staged diffs, and relevant history.
   Identify any unborn state before defining one coherent scope. Preserve
   unrelated changes, including existing staged work.
2. Draft the commit subject and body. For preparation or message-only work,
   report the proposed scope, message and results of the focused checks run.
   Use the [validation workflow](../validate-change/SKILL.md) to choose checks.
3. Before an authorized commit, run the full validation profile on the exact
   proposed snapshot using the [validation workflow](../validate-change/SKILL.md).
   Resolve required failures and reverify before staging or committing.
4. Stage only with authorization for staging or committing. A commit request
   covers staging its reviewed scope. Stage explicit paths and inspect the staged
   diff for unrelated work, secrets, generated output and local-only settings.
   Reverify if the staged contents differ from the validated snapshot.
5. Create the authorized commit and report its hash and subject.
