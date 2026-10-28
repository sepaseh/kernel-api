# Git Workflow

Read this routing page for issue implementation, branches, history, commits,
pull requests or reviews. Inspect relevant local state and evidence before acting;
read [safety](safety.md) before mutations or remote writes.

| Topic                 | Canonical rule/workflow                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Branch/base selection | [Branches](branches.md)                                                                                             |
| Commit policy         | [Commits](commits.md) and [commit workflow](../skills/commit/SKILL.md)                                              |
| Issue handoff         | [Issues](issues.md), [create issue](../skills/create-issue/SKILL.md), [start issue](../skills/start-issue/SKILL.md) |
| Pull requests/reviews | [Pull requests](pull-requests.md), [code review](code-review.md)                                                    |
| Required validation   | [Manifest](../validation.json), [validate change](../skills/validate-change/SKILL.md)                               |
| Release/protection    | [Releasing](../../docs/releasing.md), [branch protection](../../docs/branch-protection.md)                          |

## Before committing

1. Inspect branch/index/working-tree state and preserve unrelated tracked/untracked
   work. Reuse a suitable branch or verify the base under the branch policy.
2. Review relevant working and staged changes; handle absent HEAD in an unborn
   repository explicitly instead of assuming history exists.
3. Run every required check in the `full` profile of
   [the canonical manifest](../validation.json), following
   [the validation policy](../../docs/validation.md). The manifest is shared
   with CI and the checked `settings.json` projection; do not maintain another
   complete command list here.

4. Do not stage or create a commit when any required check fails or cannot run.
   Resolve safe in-scope failures and rerun affected checks. Report unresolved
   blockers without silently bypassing or weakening the gate.
5. Stage only the files that belong to the requested change.
6. Use a concise commit message with a first line under 72 characters.

## Rules

- Do not commit unless the user explicitly asks.
- Do not push unless the user explicitly asks.
- Avoid `git add .` or `git add -A` unless the user asks for a broad commit.
- Never commit `.env`, credentials, build output, or local-only settings.
- Never use `--no-verify` unless the user explicitly asks.
- Never force-push to `main` or `master`.
- Do not add AI co-author trailers unless the user asks for one.
- A draft request does not authorize publication; a commit does not authorize a
  push, amend or history rewrite. Reuse authorization already present in the task
  rather than asking for it again. Remote comments, assignments, labels, reviews,
  closing and merging each require authorization for that action.
- Link issues, branches and requests when verified. Do not invent repository hosts,
  issue numbers, labels, base branches or historical behavior.
