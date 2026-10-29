# Security policy

[English](SECURITY.md) · [فارسی](SECURITY.fa.md)

Never commit credentials, tokens, private keys, populated environments, real DB or
uploaded objects. Use protected secret storage and synthetic test values; rotate any
exposed secret. Report suspected vulnerabilities privately to the repository owner;
use GitHub private vulnerability reporting for this repository if enabled, otherwise
request a private channel through the owner's GitHub profile. Do not publish sensitive
reproduction details in public issues, logs or commits.

Follow the [threat model](docs/security/threat-model.md), [authentication review](docs/security/authentication-review.md)
and [security review guidance](docs/security/reviews.md). Dependency audit is required;
the published snapshot does not include CodeQL or Dependabot configuration. Check
actual CI and provider results instead of assuming a control ran from configuration.
Manual DAST needs explicit staging authorization and rejects the configured production
host. No scan, production call, migration or data recovery is authorized by copying
these templates. Protect coordinated DB/object backups and validate restoration before
reopening traffic. Automatic backups and real OTP delivery are not supplied.
