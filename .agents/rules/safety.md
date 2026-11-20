# Safety

Read this guidance before shell commands, sensitive-file access, Git changes or
remote actions. Keep work within the authorized repository and preserve unrelated
tracked, staged and untracked work.

## Authorization

Follow the [Git workflow](git.md#authorization) for local changes, history changes
and remote actions. Honor authorization already given for the same action and
scope.

## Destructive commands

Get explicit user authorization and verify the exact target before running a
destructive command. Inspect status and relevant diffs before changing Git
state. Avoid `git reset --hard`, `git clean -fd` and recursive moves or deletions
against computed paths.

Before recursive cleanup, verify the resolved target stays within the owned root.
Delete only resources created for the task and preserve operation and cleanup
failures.

## Secrets and local state

Get explicit authorization before reading, printing, editing or committing
secrets. Treat real `.env` files, private keys, credential files, tokens,
passwords, databases and uploads as sensitive. Never dump the full environment
or run broad secret searches. Authentication tools may use existing credentials
without exposing their values. Use only names and metadata for status checks.

Use synthetic disposable fixtures for tests and evaluations. Keep real
environments, credentials, databases, buckets, uploads and existing services
out of fixtures.

Keep machine-specific tool settings in ignored `.agents/settings.local.json`.
Keep that file private and leave it unread while reviewing guidance.

## Local artifacts

Keep repository-specific scratch exports, validation evidence and recovery files
in ignored subdirectories of this repository, such as `coverage/`. Use this
location for repository artifacts that would otherwise go in global Codex
directories or external worktree collections.

## External systems

Use authorized targets for external actions. Keep local experiments away from
production and mainnet endpoints. Never push directly to protected `main` or
`master`.

Confirm authorization for messages and changes under the
[Git action boundaries](git.md#authorization).

### Standalone PR comments

Post standalone PR comments only with prior explicit user authorization.
Authorization to fix, commit, push or reply to review threads does not authorize
a standalone comment.

## Optional safety hooks

Optional safety hooks are a host convenience. Keep authorization and the full
validation gate in effect whether or not a host loads them. The application can
run independently of the hooks, which neither grant permission nor provide a
complete security boundary.

Keep files outside the authorized project scope untouched.
