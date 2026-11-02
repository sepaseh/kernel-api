---
name: review-pr
description: Review a Kernel pull request for actionable defects using the complete diff, current source and actual phase evidence.
---

# Review a pull request

Read [Git workflow](../../rules/git.md), [code review](../../rules/code-review.md),
[pull requests](../../rules/pull-requests.md) and [safety](../../rules/safety.md).

1. Verify repository and PR, then read title/body, relevant acceptance criteria,
   current checks, commits and the complete base-to-head diff. Preserve checkout
   state; local review does not require changing branches or the index.
2. Inspect actual implementation, local HTTP contracts, collection entries, synthetic
   fixtures and tests. Read the current publication policy and actual check results before
   claiming application, HTTP, database, authentication or storage test evidence.
   Review independently released consumer compatibility through the local HTTP contract;
   external project source or documentation is not required for this review.
3. Evaluate concrete defects using the code-review rule. A passing check is
   evidence rather than a substitute for source review; stale provider approval
   does not approve a newer commit.
4. Report actionable findings first, with priority, tight location, failure trigger,
   impact and fix direction. If none remain, say so and disclose evidence limits.
5. Submit remote comments/reviews only under the user's explicit authorization,
   including existing authorization in the current conversation. A local review
   does not authorize CodeRabbit, merging or publication.

Before an authorized CodeRabbit request, follow the canonical
[preflight](../../rules/pull-requests.md#coderabbit-request-preflight). Verify all
required current-head non-CodeRabbit checks for the declared phase, including the
scanner and actual Sonar gate, and zero unresolved issues across every page and
severity of the complete applicable report. Missing or stale evidence, including
an open documented false positive, blocks the request. A new commit requires fresh
preflight; respect actual quota and avoid duplicate in-flight requests.
