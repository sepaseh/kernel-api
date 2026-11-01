---
name: commit
description: Prepare or create a safe Kernel API commit when asked to commit, stage a coherent change, or suggest its commit message.
---

# Commit changes

Read [Git](../../rules/git.md), [branches](../../rules/branches.md),
[commits](../../rules/commits.md) and [safety](../../rules/safety.md). Use
[validate-change](../validate-change/SKILL.md) for the canonical gate.

1. Establish the current branch, working-tree/index state, relevant history and
   requested scope. Handle missing HEAD in an unborn repository explicitly;
   preserve unrelated tracked and untracked work.
2. Identify one coherent commit. A message/preparation request does not authorize
   staging or creating a commit; a staging request does not authorize history changes.
3. Before an authorized commit, run the full canonical validation profile on the
   final tree. Fix safe in-scope failures and rerun affected checks; never replace
   that gate with a fast subset or remote CI. Disclose unresolved failures and stop
   the commit when a required check fails or cannot run.
4. Stage only explicit authorized paths, then inspect the staged diff for unrelated
   changes, secrets and generated output. Recheck the final scope and any changes
   made after validation before committing.
5. Form the subject/body from the commit rule. Create the commit only if explicitly
   requested; otherwise return the prepared scope/message locally.
6. Report the resulting hash and subject when created. Do not infer authorization
   to push, amend, rewrite history, add attribution or publish a pull request.
