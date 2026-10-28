# API validation

[English](validation.md) · [فارسی](validation.fa.md)

[The validation manifest](../.agents/validation.json) is the source of truth for
commands and profiles. Run the smallest relevant check during development, then
`npm run validate -- full` on the exact proposed snapshot before each authorized
commit or push. A failed or unavailable check is not a pass; report it and its
scope. The full profile is also used by required PR CI.

Use only disposable synthetic fixtures. [Testing](testing.md) describes evidence
and limitations, while [Sonar guidance](sonarqube.md) distinguishes the scanner,
quality gate and complete issue report. A local pass does not establish a deployed
service, production OTP delivery, or a successful remote review.

Docker and native deployment smoke commands are explicit opt-in checks; the full
profile does not run them. Use the [deployment guide](deployment.md) and report the
actual platform and outcome rather than assuming a service manager was exercised.
