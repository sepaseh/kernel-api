---
name: start-issue
description: Begin implementation of an existing Kernel API issue when asked to work on, fix, implement or pick up that issue.
---

# Start an issue

Read [Git](../../rules/git.md), [issues](../../rules/issues.md),
[branches](../../rules/branches.md) and [safety](../../rules/safety.md).

1. Identify the actual repository and issue from local material or authorized
   remote metadata. Read its body, relevant comments and linked evidence; do not
   infer scope from its title or invent an issue number.
2. Verify the report against current source. Separate facts, unknowns, acceptance
   criteria and true dependencies. If already resolved or duplicated, report the
   evidence; investigate safe independent questions before requesting a material
   missing decision. Keep security details within the security policy.
3. Find owners, contracts and checks through the task navigation. Build the
   implementation plan around observable acceptance criteria and HTTP compatibility.
4. Inspect branch/index/working-tree state and preserve unrelated work. Reuse the
   issue's suitable branch or establish the verified base and a compliant branch
   when the implementation request authorizes that step.
5. Implement the requested scope with targeted validation from
   [validate-change](../validate-change/SKILL.md). Report actual changes, checks and
   unresolved decisions. Do not assign, label, comment, change issue status, commit,
   push or open a pull request without authorization for that action.
