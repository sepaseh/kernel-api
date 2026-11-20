---
name: review-pr
description: Review a Kernel pull request for actionable defects or address existing review feedback using the complete diff, current source and actual phase evidence.
---

# Review a pull request

Follow the [Git workflow](../../rules/git.md) and [code review rules](../../rules/code-review.md).

For a request to address existing review feedback, start with
[Address review feedback](../../rules/code-review.md#address-review-feedback)
before switching branches or editing files. Apply the steps below when reviewing
a PR.

1. Verify the repository and PR. Read the title, description, relevant acceptance
   criteria, current checks, commits and complete base-to-head diff. Keep the
   review read-only and preserve the current branch and index.
2. Inspect the implementation, local HTTP contracts, synthetic fixtures and
   relevant tests. Check the [publication policy](../../../.github/bootstrap-policy.json)
   and use the published local contract when assessing compatibility with
   independently released consumers.
3. Verify the [current-head evidence](../../rules/pull-requests.md#provider-evidence-and-required-checks)
   for claims about the build, coverage, application tests, analysis and approval.
4. Report [actionable findings](../../rules/code-review.md#findings) and disclose
   the limits of the evidence reviewed. Apply the
   [remote action rules](../../rules/safety.md#external-systems) before submitting
   a comment or review.

Use the [CodeRabbit preflight](../../rules/pull-requests.md#coderabbit-request-preflight)
for a separately authorized review request.
