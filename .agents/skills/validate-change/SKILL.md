---
name: validate-change
description: Select Kernel checks for the actual change and run the complete canonical gate before an authorized commit, push or PR handoff.
---

# Validate a change

Read the [publication policy](../../../.github/bootstrap-policy.json) for the
phase, readiness and admitted files. Read the affected source, tests and rules.
Inspect the working tree and staged changes under the
[working-checkout rule](../../rules/branches.md#working-checkout).

## Focused checks

Start with the smallest relevant published check from the
[validation manifest](../../validation.json). Add a focused regression for
changed observable behavior under the [testing rules](../../rules/testing.md).

- For source or dependency boundary changes, select type, lint and boundary checks.
- For HTTP, DTO and Bruno changes, use the owning API and contract tests and
  [collection review](../../rules/collection-quality.md).
- For delete, status and relation changes, follow the
  [data lifecycle rule](../../rules/data-lifecycle.md) and run the applicable
  synthetic transaction, failure, authentication and storage tests.

## Full verification

Record the source revision and exact proposed tree before exporting. Before an
authorized commit, push or PR handoff, run `npm run validate -- full` on a fresh
verification-only export of the exact proposed snapshot. Follow the
[locked installation and isolation procedure](../../../CONTRIBUTING.md#validation-and-authorization)
and use disposable synthetic fixtures.

Resolve required failures within the task's scope and reverify. Preserve
required checks, genuine failing assertions and coverage. Leave staging and
committing pending while a required check fails or cannot run.

## Report evidence

Report the phase, readiness, checked revision or tree, commands, actual results
and unavailable checks. Use the
[provider evidence rules](../../rules/pull-requests.md#provider-evidence-and-required-checks)
for hosted checks and approval, and the
[guidance evidence rules](../../rules/guidance.md) for instruction discovery.

Identify the published source and synthetic fixtures responsible for the local
evidence and disclose unpublished capabilities. Tie production readiness claims
to the declaration and actual deployed evidence.
