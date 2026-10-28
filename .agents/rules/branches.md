# Branches

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
