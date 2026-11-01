# Branches

## Working checkout

Use the existing repository checkout for implementation and pull-request fixes.
Inspect the current branch, tracked/untracked changes and `git worktree list`, then
reuse a suitable existing checkout while preserving unrelated work.

Creating an additional Git worktree, clone or copied implementation checkout of
this repository requires prior explicit user authorization for that specific
action and scope. An ordinary request to implement, review, commit or push does
not authorize another checkout. A missing, dirty or busy checkout does not grant
permission either. This rule applies to Git CLI commands, Codex app/tools,
automatic isolation and delegated or subagent work; pass the restriction to any
delegated agent.

If an additional implementation checkout is necessary, explain the reason and
proposed absolute path, then ask before creating it. Honor explicit authorization
already given in the session for the same action and scope without asking again.

Required disposable validation exports of the exact proposed tree remain
verification-only under the [validation policy](../../docs/validation.md), not
implementation workspaces or authorization to create a Git worktree or clone.
Preserve the repository's fixture ownership, isolation and cleanup constraints.

Use `codex/<short-kebab-purpose>` by default. Include a verified issue number when
useful, for example `codex/42-settings-validation`. A user-requested exact name
takes precedence. Keep mutable priority, assignee and status metadata out of names.

- Inspect the current branch, tracked/untracked changes and the intended base
  before changing branches. Verify the base locally or through authorized metadata;
  do not assume that `main` exists or is current.
- Reuse a branch that already represents the requested work. Create or switch
  branches only within the authorized task, preserving unrelated user changes.
  Do not stash, reset or commit those changes merely to make switching convenient.
- For an unborn repository, account for the existing index and untracked files;
  do not assume HEAD/history exists or initialize history without authorization.
- Do not commit directly to a protected base. Follow the [Git workflow](git.md)
  and the [commit rule](commits.md) when a commit is requested.
- Renaming/deleting a published branch or rewriting history requires an explicit
  request and consideration of any open pull request. Branch creation does not
  authorize publishing, pushing, closing issues or changing remote metadata.
