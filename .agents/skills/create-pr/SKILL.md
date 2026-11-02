---
name: create-pr
description: Prepare or create a focused Kernel pull request with exact-snapshot validation and explicit publication authorization.
---

# Create a pull request

Read [Git workflow](../../rules/git.md), [pull requests](../../rules/pull-requests.md),
[branches](../../rules/branches.md), [commits](../../rules/commits.md) and
[safety](../../rules/safety.md). Use [validate-change](../validate-change/SKILL.md)
for the final gate.

1. Verify repository, current head, live intended base and available host tools.
   Preserve unrelated and unpublished work; a local draft is not remote publication.
2. Before opening a PR, review the complete base-to-head diff and aim for at most
   80 GitHub changed-file entries initially. Split independent changes when useful
   and explain why a larger cohesive change belongs together. Count additions,
   deletions, renames and binaries; a rename is one entry. File count is advisory:
   exceeding 100 files alone must not fail CI or require deleting and recreating a PR.
3. Read the declared phase, `applicationReady` and exact admitted inventory from
   [the publication policy](../../../.github/bootstrap-policy.json). Run the
   [canonical full profile](../../validation.json) on the exact proposed snapshot
   and record the declaration, revision/tree and actual checks. Retain false
   readiness until authorized application admission and its complete genuine gate
   have passed; never change the declaration to bypass checks. Disclose unpublished
   capabilities and unavailable evidence.
4. Use a Conventional Commit title and the existing PR template. Explain the
   concrete problem, resulting behavior, verification and limitations.
5. Apply authorization and preferences already provided in the conversation. An
   explicit request to publish/create the PR authorizes the necessary branch push;
   do not ask again for an already authorized action. If publication is not
   authorized, prepare the reviewable local result and ask only for the missing
   remote action. Honor an explicit Ready for review preference after required
   local work is complete; otherwise preserve the user's requested draft state.
6. Report the PR URL or local draft and material evidence gaps. PR creation does
   not itself authorize merging, requesting CodeRabbit or changing unrelated
   remote metadata.

Before an authorized CodeRabbit request, complete the canonical
[preflight](../../rules/pull-requests.md#coderabbit-request-preflight): all latest-head
non-CodeRabbit required checks, scanner and actual Sonar quality gate pass, and
every page of the complete applicable unfiltered unresolved issue report is empty.
Respect current allowance and avoid duplicate in-flight requests. A new commit
invalidates preflight; provider classification requires its own authorization.
