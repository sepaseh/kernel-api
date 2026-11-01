# API validation

The [canonical manifest](../.agents/validation.json) owns commands and profiles.
Run `npm run validate -- full` against an isolated export of the exact
[publication inventory](../.github/bootstrap-policy.json) before each authorized
commit or PR. Preserve unrelated files in the working checkout.

Every source-phase full profile runs all ten required checks: snapshot, CI policy,
dependency audit, source boundaries, typechecking, lint, formatting, guidance,
measured source/tooling tests and audit-helper tests. The manifest owns their
commands and order. The previous governance phase ran six checks for its own
scope; that earlier profile cannot replace the source-phase gate.

Run the complete profile for every PR, including drafts and documentation-only
changes, without changed-path or target-branch filters. Pure or fake-port tests do not
stand in for unpublished service, HTTP, database, authentication or storage tests.
Add relevant real behavior evidence as each owner is published.

CI runs full validation once. Its dependent Sonar job consumes measured coverage
bound to that same source and workflow run. Scanner execution and the provider's
quality-gate result are separate evidence. Missing configuration, failed audit
requests, absent reports, stale source or provider skips must remain visible.

The read-only bootstrap file-budget check runs for PRs on any target. Privileged
trusted guards apply only to PRs targeting `main` and become available only after
their reviewed default-branch publication. Stacked PRs targeting prerequisite
branches therefore have pending trusted enforcement. Retarget after the
prerequisites merge and obtain fresh checks for the current head and base.
Neither local configuration nor a local pass proves remote protection is active.

An explicit request to publish ready for review may be followed while provider
results remain pending. Report those limits; the PR status does not waive the
CodeRabbit preflight, establish a quality gate or authorize merging.

Use disposable owned fixtures. Report actual QA results in the current chat;
create a report only on explicit request under ignored `test-results/`.
