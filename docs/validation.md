# API validation

[English](validation.md) · [فارسی](validation.fa.md)

[The validation manifest](../.agents/validation.json) is the source of truth for
commands and profiles. Run the smallest relevant check during development, then
`npm run validate -- full` on the exact proposed snapshot before each authorized
commit or push. A failed or unavailable check is not a pass; report it and its
scope. The full profile is also used by required PR CI.

The root-level `/_local-preserved/` directory is excluded from Prettier checks.
It is local archive data, not part of the validated publication snapshot.

The active manifest and validation runner describe this standalone API. They do
not define or execute a `workspace` profile; the full profile remains the required
commit and push gate.

Use only disposable synthetic fixtures. [Testing](testing.md) describes evidence
and limitations, while [Sonar guidance](sonarqube.md) distinguishes the scanner,
quality gate and complete issue report. A local pass does not establish a deployed
service, production OTP delivery, or a successful remote review.

Docker and native deployment smoke commands are explicit opt-in checks; the full
profile does not run them. Use the [deployment guide](deployment.md) and report the
actual platform and outcome rather than assuming a service manager was exercised.

The snapshot check validates the published file inventory, including collection examples and fixture tests. Additional local files are not automatically part of the proposed snapshot; validate the exact intended contents rather than interpreting an ambient working-tree run as evidence for a different commit.

Use synthetic disposable fixtures, never owner environment files, data or an
existing API. An audit service or network failure makes validation incomplete,
not clean. PR policy and Sonar CI, and the staging, smoke and DAST workflows
have their own scopes. The CodeQL and release workflows also have separate scopes.
Configuration alone does not prove remote execution or branch protection. Keep the manifest, settings projection, CI, navigation and bilingual
documents aligned.
