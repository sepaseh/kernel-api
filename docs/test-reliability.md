# Investigate unreliable tests

Investigate the first failure even when a rerun passes. Preserve the exact
command, runtime, platform, error output and synthetic fixture in use. Identify the responsible suite using [testing](testing.md#choose-a-suite)
and recreate the same conditions. Use the error and fixture lifecycle to
distinguish a policy defect, race, resource leak or unavailable dependency.

Prefer deterministic completion and isolated owned resources. Never hide a
required failure with retries, skips or weakened assertions. Close processes,
clients and listeners before removing fixtures. Preserve operation and cleanup
failures together and remove only resources created by the current test.

Report observed outcomes in the current chat. Label unconfirmed causes as
hypotheses, disclose checks that could not run, and do not include credentials or
real user data. Create a local report only on explicit request under ignored
`test-results/`.

After correcting the cause, rerun the owning test or suite. Complete the
[validation gate](validation.md) on the exact proposed tree before an
authorized commit or PR.
