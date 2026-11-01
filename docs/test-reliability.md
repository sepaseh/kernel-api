# Investigating unreliable tests

A failure followed by a pass still requires investigation. Record the first
failure, exact command, runtime, platform and owned synthetic fixture. Distinguish
a policy defect, race, resource leak and unavailable dependency. Reproduce the
same conditions rather than rerunning until green.

Prefer deterministic completion and isolated owned resources. Never hide a
required failure with retries, skips or weakened assertions. Close processes,
clients and listeners before removing fixtures. Preserve operation and cleanup
failures together and remove only resources created by the current test.

Report observed outcomes in the current chat. Label unconfirmed causes as
hypotheses, disclose checks that could not run, and do not include credentials or
real user data. Create a local report only on explicit request under ignored
`test-results/`.

The current tests validate repository governance. Future HTTP, authentication,
database and storage scenarios must establish their own evidence when their
source is published. See [testing](testing.md) and [validation](validation.md).
