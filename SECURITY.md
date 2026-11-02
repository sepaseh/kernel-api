# Security policy

Do not publish credentials, private environment files, database contents, uploads
or sensitive error details in issues, pull requests, logs or chat.

Coordinate sensitive reports privately with the repository owner. If GitHub
private vulnerability reporting is available for this repository, use that
feature. Do not assume it is enabled merely because this policy exists.

The first publication contains governance tools and configuration. It does not
establish a deployed API, production OTP delivery or operational readiness.
Future API changes must preserve authentication, authorization, transaction,
hard-deletion and storage constraints in the published assistant rules.

Review configuration changes for token permissions, immutable trusted checkouts,
pinned actions, fork boundaries and provider identity. Never execute unreviewed
PR code with privileged default-branch credentials. Do not bypass protection,
suppress required security findings or claim a skipped scan is a successful scan.
