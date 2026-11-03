# Branches

## Working checkout

Before implementation or pull-request fixes, inspect the current branch, Git
status and `git worktree list`. Reuse a suitable existing checkout and preserve
unrelated tracked, staged and untracked changes.

Creating any additional Git worktree, clone or copied implementation checkout of
this repository requires prior explicit user authorization for that specific
action and scope. An ordinary implementation, review, commit or push request is
not permission to create another checkout. A missing, dirty or busy checkout does
not grant that permission either. This rule applies to Git CLI commands, Codex
app/tools, automatic isolation and work delegated to subagents; delegation does
not authorize creation.

If another implementation checkout is required, explain why, give its proposed
absolute path and ask before creating it. Honor explicit authorization already
given in the current session for the same action and scope without asking again.

Canonical required disposable validation exports remain verification-only. They
must follow the repository's fixture and validation constraints and must never
become implementation workspaces.

Keep repository-specific scratch exports, validation evidence and recovery
files in ignored subdirectories inside this repository, such as `coverage/`.
Do not store these artifacts in global Codex directories or external worktree
collections.

Use a short purpose-based name. The default is `codex/<short-kebab-purpose>`;
include a verified issue number when it helps identify the work. An explicit
user-requested name takes precedence. Do not encode mutable labels, priority or
assignee metadata in the name.

- Reuse a current branch that already represents the requested work.
- Before creating or switching branches, inspect the current branch, working
  tree and staged changes. Preserve unrelated tracked and untracked work.
- Start from the intended base verified from the user's request or repository
  metadata; do not assume a branch name or silently discard local changes to
  reach it. An unborn repository has no committed base: report that fact and
  preserve its working tree rather than inventing history.
- Branch changes must be authorized by the task. Do not rename/delete a
  published branch or rewrite history without explicit authorization and
  coordination with affected review requests.

Use [Git workflow](git.md) for action boundaries and [commits](commits.md) for
commit naming. Branch preparation does not authorize a commit or push.
