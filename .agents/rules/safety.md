# Safety

Read this guidance before shell commands, sensitive-file access, Git changes or
remote actions. Keep work within the authorized repository and preserve unrelated
tracked, staged and untracked files.

## Destructive commands

Do not run destructive commands unless the user explicitly authorizes the action
and the exact target has been verified. Avoid `git reset --hard`, `git clean -fd`,
force pushes and recursive moves/deletes against computed paths. Inspect status
and relevant diffs before changing Git state. Existing authorization in the current
conversation remains valid; do not ask again for the same authorized action.

Before recursive cleanup, verify the resolved target stays within the owned root.
Delete only resources created for the task and preserve operation and cleanup
failures rather than suppressing either.

## Secrets and local state

Do not read, print, edit or commit secrets without explicit authorization for that
specific access. Treat real `.env` files, private keys, credential files, tokens,
passwords, databases and uploads as sensitive. Never dump the full environment or
run broad secret searches. Authentication tools may use existing credentials
without exposing their values; status checks need names and metadata only.

Never use operator environments, existing services, databases, buckets or uploads
as test fixtures. Use synthetic disposable resources. Keep machine-specific tool
settings in ignored `.agents/settings.local.json` rather than changing shared
product rules; do not read or publish that local file while reviewing guidance.

## External systems

Do not contact production/mainnet endpoints for local experiments or push directly
to protected main/master. Publication, remote messages/reviews, issues, merges and
remote configuration require explicit authorization covering that action. Honor
existing session authorization and user preferences without inventing additional
approval steps; preparation alone does not authorize remote effects.

Post standalone PR comments only with prior explicit user authorization.
Authorization to fix, commit, push or reply to review threads does not authorize
a standalone comment.

Keep files outside the authorized project scope untouched. Optional safety hooks
are a host convenience, not a complete security boundary, permission grant,
runtime dependency or substitute for the full validation gate.
