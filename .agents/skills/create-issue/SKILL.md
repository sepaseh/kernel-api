---
name: create-issue
description: Draft or publish an actionable Kernel GitHub issue.
---

# Create an issue

Read `.agents/rules/issues.md`, plus `.agents/rules/git.md` and
`.agents/rules/safety.md`. An issue is a durable handoff, not a transcript.

1. Confirm the repository and requested draft/publication scope. Inspect relevant
   code, docs, tests and both open/closed issues for duplicates, using available
   authorized metadata. Do not invent a reproduction or publish a suspicious
   pattern without a concrete failure scenario.
2. State observed facts, expected outcome, impact, evidence, and objective verification.
3. Keep one issue focused on one independently verifiable outcome. Exclude credentials, tokens, personal data, and production payloads.
4. Follow the issue rule's body shape. Verify any template/label actually exists;
   leave missing facts unknown with what was checked. Route vulnerabilities through
   SECURITY.md and sanitize evidence.
5. For draft-only work, return the proposed title/body locally. Create an issue only
   with explicit authorization already established in the task. Do not add an
   assignee, milestone, project or status change unless requested. Return the URL
   when created; starting implementation is a separate requested workflow.
