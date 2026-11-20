# Security policy

## Report a vulnerability privately

Use **Report a vulnerability** in the repository's GitHub **Security** tab when
private reporting is available. Otherwise, ask the repository owner for a
secure channel before sharing technical details. Keep reports and sensitive
details out of public issues, pull requests, commits and logs.

Include the affected revision, feature or endpoint, expected and observed
behavior, potential impact and steps using synthetic data. Redact credentials,
tokens, personal information and sensitive payloads from the report and any
attachments. Review error messages and nested causes before sharing them.

Keep real configuration, records and uploads out of public reports. Keep
sensitive report details out of assistant messages.
[Repository security](https://github.com/sepaseh/kernel-api/security)

## Scope

The [publication inventory](.github/bootstrap-policy.json) lists the reviewed API
source and tooling. The published API includes local authentication,
authorization, persistence, HTTP and storage. `applicationReady` is `false`.
Production OTP delivery is unavailable.

For trust boundaries and contributor checks, see the [threat model](docs/security/threat-model.md)
and [security review guide](docs/security/reviews.md).
