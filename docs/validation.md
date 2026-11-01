# Governance validation

The [canonical manifest](../.agents/validation.json) owns commands and profiles.
Run `npm run validate -- full` against an isolated export of the exact
[publication inventory](../.github/bootstrap-policy.json) before each authorized
commit or PR. Preserve unrelated files in the working checkout.

The governance profile performs real snapshot, CI/policy, audit, formatting,
guidance and measured test checks. It does not invent passing API checks for
absent source. Before later application publication, restore the complete ten
application checks and validate the relevant real source and behavior.

CI runs full validation once. Its dependent Sonar job consumes measured coverage
bound to that same source and workflow run. Scanner execution and the provider's
quality-gate result are separate evidence. Missing configuration, failed audit
requests, absent reports, stale source or provider skips must remain visible.

The first PR can run a read-only bootstrap file-budget check. The trusted
default-branch guard becomes available only after its reviewed publication.
Neither local configuration nor a local pass proves remote protection is active.

Use disposable owned fixtures. Report actual QA results in the current chat;
create a report only on explicit request under ignored `test-results/`.
