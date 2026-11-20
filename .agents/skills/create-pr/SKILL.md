---
name: create-pr
description: Prepare or create a focused Kernel pull request with exact-snapshot validation and explicit publication authorization.
---

# Create a pull request

Follow the [Git workflow](../../rules/git.md) and
[pull request rules](../../rules/pull-requests.md).

1. Verify the repository, current head, live intended base and available host
   integration. Follow the [working-checkout rule](../../rules/branches.md#working-checkout).
   Review the complete base-to-head diff and apply the
   [PR scope rules](../../rules/pull-requests.md#before-creation).
2. Confirm the phase, readiness and admitted files in the
   [publication policy](../../../.github/bootstrap-policy.json). Apply the
   [validation workflow](../validate-change/SKILL.md) to the exact proposed
   snapshot. Record its revision or tree, actual results, unavailable evidence
   and any unpublished capabilities.
3. Prepare the title and body using the [PR template](../../../.github/PULL_REQUEST_TEMPLATE.md)
   and [body and linkage rules](../../rules/pull-requests.md#body-and-linkage).
   Explain the resulting behavior and include the actual validation evidence.
4. Return a local draft for preparation work or when publication authorization
   is missing. Follow the local [PR publication rules](../../rules/pull-requests.md)
   and [remote action rules](../../rules/safety.md#external-systems) for the push
   and PR creation. Honor the requested draft or ready-for-review state after
   required local checks pass. Report the URL and any pending checks.

Use the [CodeRabbit preflight](../../rules/pull-requests.md#coderabbit-request-preflight)
for a separately authorized review request.
