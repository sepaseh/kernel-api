---
name: review-pr
description: Review a Kernel pull request for actionable defects.
---

# Review a pull request

Read `.agents/rules/git.md`, `.agents/rules/code-review.md`,
`.agents/rules/pull-requests.md`, and `.agents/rules/safety.md`.

1. Confirm the repository and PR. Read its title, body, linked acceptance criteria,
   relevant comments, checks, commits and complete base-to-head diff.
2. Inspect relevant implementation, tests, collection entries, and documentation.
3. Evaluate the affected dimensions in `code-review.md`; do not treat CI as a substitute for review.
4. Report actionable findings first, ordered by priority, with tight locations and failure scenarios.
   Review changed functions' phases under code-quality.md; keep style preferences,
   questions and non-blocking suggestions separate from introduced defects.
5. Submit a remote review only when the user explicitly authorizes it.
6. If the task authorizes requesting or re-requesting CodeRabbit, first enforce
   [CodeRabbit preflight](../../rules/pull-requests.md#before-requesting-coderabbit):
   all required non-CodeRabbit checks, Sonar scanner execution and its actual
   quality gate must pass for the exact current head, with zero open/unresolved
   issues in the complete applicable latest Sonar PR/branch report at every
   severity, including existing issues. Recheck after every commit. Missing,
   skipped, pending or failed evidence blocks the request. Exclude CodeRabbit's
   own status/approval only to avoid a cycle; respect quotas and one in-flight
   request per head. Reading existing findings remains allowed before preflight.
