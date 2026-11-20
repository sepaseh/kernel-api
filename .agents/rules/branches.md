# Branches

## Working checkout

Before implementation, pull-request fixes or a branch change, check the current
branch, `git status`, staged changes and `git worktree list`. Reuse a suitable
existing checkout and preserve unrelated tracked, staged and untracked work.

Get explicit user authorization before creating an additional Git worktree,
clone or copied implementation checkout. Authorization must cover that action
and scope. This applies to direct tools, host automation and work delegated to
subagents, including when the existing checkout is missing, dirty or busy.

When an additional checkout is required and authorization is missing, explain
why and give the proposed absolute path before asking. Honor authorization
already given for the same action and scope.

Use disposable validation exports only for verification. Follow the repository's
fixture and validation rules. Keep repository-specific scratch exports,
validation evidence and recovery files in ignored subdirectories inside the
repository, such as `coverage/`. Keep those files out of global Codex directories
and external worktree collections.

## Branch lifecycle

Use a short purpose-based name. The default is `codex/<short-kebab-purpose>`.
Include a verified issue number when it helps identify the work. An explicit
user-requested name takes precedence. Do not encode mutable labels, priority or
assignee metadata in the name.

- Reuse a current branch that already represents the requested work.
- Verify the intended base from the request or repository metadata. Preserve local
  changes when switching. If the repository has no commits, report the missing
  base and preserve the working tree.
- Keep branch changes within the authorized task. Renaming or deleting a
  published branch requires explicit authorization and coordination with affected
  review requests.

For branch changes, check the [Git context](git.md#establish-context). Follow the
[Git authorization rules](git.md#authorization) for commits, pushes and history
rewrites.
