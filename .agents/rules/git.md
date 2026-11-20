# Git workflow

Read [safety](safety.md) before changing Git state or a remote system.

| Topic                       | Canonical guidance                                                              |
| --------------------------- | ------------------------------------------------------------------------------- |
| Branch naming and lifecycle | [Branches](branches.md)                                                         |
| Commit scope and subject    | [Commits](commits.md)                                                           |
| Issue quality and startup   | [Issues](issues.md), [start-issue](../skills/start-issue/SKILL.md)              |
| Pull requests and review    | [Pull requests](pull-requests.md), [code review](code-review.md)                |
| Checks and handoff          | [Validation](../../docs/validation.md), [change handoff](../../CONTRIBUTING.md) |

## Establish context

Check the repository, branch, status and relevant diffs before acting. Preserve
unrelated tracked, staged and untracked work. Verify remote metadata with
authorized tools. Report observed facts, inferences and access limits separately.
Follow the [working-checkout rule](branches.md#working-checkout).

## Before committing

Follow the [commit workflow](../skills/commit/SKILL.md) for scope, exact-tree
validation and staged-diff review.

## Authorization

Apply authorization and preferences already given in the conversation. Ask only
for authorization that is still missing.

- Require explicit authorization for staging, committing, pushing, amending or rewriting
  history. An explicit commit request covers staging its
  [reviewed scope](commits.md#scope-and-validation).
- Require explicit authorization for each issue or PR publication, update, status change,
  review request, review submission, conversation resolution, merge or closure.
  See the [PR publication rule](pull-requests.md#publish-a-pull-request) for the
  necessary branch push. Issue creation and implementation are separate actions.
- Require explicit authorization for standalone PR comments, assignment,
  labels and other metadata changes. Fixing code, committing, pushing or replying
  to review threads leaves standalone comments outside that authorization.
- Use draft or preparation requests to produce local results. Use
  [branch guidance](branches.md#branch-lifecycle) for branch changes and
  [branch protection](../../docs/branch-protection.md) for remote protection.

Never force-push or bypass required checks.

## Rules

- Use `git add .` or `git add -A` only if the user requests a broad commit.
- Use `--no-verify` only when the user explicitly authorizes skipping optional
  hooks. Required checks still apply.
- Add AI co-author trailers only at the user's request.
