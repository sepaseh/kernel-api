# Contributing to Kernel API

[English](CONTRIBUTING.md) · [فارسی](CONTRIBUTING.fa.md)

The current [foundation phase](docs/bootstrap.md) contains pure contracts,
application primitives and adapter interfaces. It is not a runnable API.
Contributions must preserve this declared scope and the independent project
boundary.

## Scope and source ownership

Keep pure wire definitions in `src/contracts/`, framework-free core code in
`src/application/` and dependency interfaces in `src/application/ports/`.
Do not import another checkout, add local-package links or introduce runtime
framework, DB or storage dependencies into these pure layers. Use the existing
boundary check rather than weakening it to permit a new dependency.

Framework, database and storage SDK types also belong in adapters, not in
application interfaces. Erasing an import at runtime does not remove this source
coupling. Local application/contract type imports remain valid; the boundary
checker distinguishes fully erased declarations from imports that still load a
module under Node's TypeScript stripping.

The exact maintained inventory is declared by
[`.github/bootstrap-policy.json`](.github/bootstrap-policy.json). Update that
inventory deliberately when adding a reviewed foundation file. Its allowlist is
not the 100-file PR limit: the repository may contain more than 100 files, while
each PR must still change no more than 100 GitHub file entries.

Preserve unrelated work, private environment files, credentials and runtime data.
Foundation tests use synthetic local fixtures. Never use real databases, uploads
or production services to validate this phase.

## Development and validation

Use [`.nvmrc`](.nvmrc), the Node range in [`package.json`](package.json) and npm 12:

```sh
npm ci
npm run validate -- full
```

[`.agents/validation.json`](.agents/validation.json) is the canonical command
inventory. Start with the smallest relevant existing check while developing.
Before **every explicitly authorized commit or PR handoff**, run its entire
`full` profile on an isolated checkout/export of the exact proposed snapshot.
A passing check that can see other untracked source does not validate a partial
published PR. Do not skip, suppress or replace a failed required check.

The full phase includes the source/snapshot guards, dependency audit, type and
style checks, measured foundation/governance coverage and audit-helper tests.
Keep tests for authorization boundaries, semantic errors, canonical permissions,
identity, locale metadata, validation and repository safety meaningful. Do not
fabricate LCOV, borrow another project's report or describe foundation coverage as
full API coverage.

A later runnable phase must introduce coherent services, transport and adapters
with the complete HTTP, DB, authentication and storage tests and its full canonical
validation gate. This foundation pass cannot replace those tests or establish
application readiness in advance.

## Pull requests and review

1. Work on a focused `codex/<purpose>` branch and inspect the entire base-to-head
   diff. Creating a branch does not authorize committing or publishing it.
2. Keep the PR at **100 or fewer GitHub changed-file entries**. Additions,
   removals, renames and binary files count; a GitHub rename is one entry.
3. Use a Conventional Commit title and the existing
   [PR template](.github/PULL_REQUEST_TEMPLATE.md). Describe the change, phase,
   exact checked revision, executed checks and remaining limitations.
4. Publish or modify remote state only when explicitly authorized. Keep incomplete
   work in draft. Do not commit credentials, runtime state or generated reports.
5. Read actual CodeRabbit findings, fix actionable defects and recheck the updated
   head. If a review is skipped, request one review within the authorized cycle;
   respect provider quota and disclose pending re-review.
6. Merge only under the ordinary required CI, native CodeRabbit and Sonar checks,
   an approving review and resolved conversations. A skipped progress status is
   not evidence of substantive review. Verify the Sonar analysis and quality gate
   separately, as described in [Sonar setup](docs/sonarqube.md).

[Branch protection](docs/branch-protection.md) describes native enforcement.
Do not weaken those requirements to merge a phase transition. Local test results
and configuration files are not evidence of a successful hosted check.
