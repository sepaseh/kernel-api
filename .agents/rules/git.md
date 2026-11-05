# Git Workflow

Use this router for issue startup, branch, commit, pull-request, review and history
tasks. Read [safety](safety.md) before changing Git state or a remote system.

| Topic                       | Canonical guidance                                                              |
| --------------------------- | ------------------------------------------------------------------------------- |
| Branch naming and lifecycle | [Branches](branches.md)                                                         |
| Commit scope and subject    | [Commits](commits.md)                                                           |
| Issue quality and startup   | [Issues](issues.md), [start-issue](../skills/start-issue/SKILL.md)              |
| Pull requests and review    | [Pull requests](pull-requests.md), [code review](code-review.md)                |
| Checks and handoff          | [Validation](../../docs/validation.md), [change handoff](../../CONTRIBUTING.md) |

Establish the actual repository/branch/status and relevant diffs before acting.
Preserve unrelated tracked, untracked and staged work; a dirty tree does not
authorize its inclusion, removal or rewrite. Verify relevant remote metadata
with available authorized tools rather than guessing the host, base or labels.
Keep facts, inferences and unresolved access limits distinct.

Existing explicit user authorization and preferences in the conversation remain
valid. Complete the authorized work without requesting approval again; ask only
for a genuinely missing action boundary. Read the actual phase, `applicationReady`
and admitted files from [the publication policy](../../.github/bootstrap-policy.json),
and required checks from [the manifest](../validation.json). A false readiness flag
does not authorize application activation; a true flag still needs genuine
current-revision evidence. Disclose capabilities and checks that remain unpublished.

## Before committing

1. Run `git status`.
2. Review the relevant `git diff`.
3. Run every required check on an isolated exact proposed snapshot using the `full` profile of
   [the canonical manifest](../validation.json), following
   [the validation policy](../../docs/validation.md). The manifest is shared
   with CI and the checked `settings.json` projection; do not maintain another
   complete command list here.

4. Resolve required failures within the task's scope and reverify. Do not stage
   or commit while a required check still fails or cannot run; report unresolved
   blockers without bypassing the gate.
5. Stage only the files that belong to the requested change.
6. Use a concise commit message with a first line of 72 characters or fewer.

## Rules

- Do not commit unless the user explicitly asks.
- Do not push unless the user explicitly asks.
- Avoid `git add .` or `git add -A` unless the user asks for a broad commit.
- Never commit `.env`, credentials, build output, or local-only settings.
- Never use `--no-verify` unless the user explicitly asks.
- Never force-push to `main` or `master`.
- Do not add AI co-author trailers unless the user asks for one.
- A request to draft or prepare is not authorization to publish. A commit does
  not authorize a push, and starting an issue does not authorize comments,
  assignment, labels, status changes or a pull request.
