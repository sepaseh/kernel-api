# Investigating unreliable tests

[English](test-reliability.md) · [فارسی](test-reliability.fa.md)

A failure followed by a pass still requires investigation. Record the first
failure, exact command, runtime, platform and synthetic fixture; distinguish a
product defect, test race, resource leak and unavailable dependency. Reproduce
the same conditions and preserve evidence rather than rerunning until green.

Prefer deterministic readiness and isolated owned resources. Do not hide a
required failure with retries, skips or weakened assertions. Clean up only fixtures
created by the test. Report checks that were not run or could not complete, and
use [validation](validation.md) to choose the final required checks.

The [2026-10-29 OTP cleanup incident](qa/otp-cleanup-2026-10-29.md) records a
Windows failure and later checks; its cause remains unconfirmed.

The multi-connection bootstrap, OTP and development-seed fixtures attempt cleanup
after setup or test failures, close each created client independently, and report
operation and cleanup failures together. These checks use owned temporary data;
they do not establish the cause of the recorded Windows file lock or guarantee that
another process cannot hold a fixture open.

The application, persistence and management database fixtures attempt each owned
client close and temporary-directory removal independently, including after partial
setup. Cleanup failures are not suppressed: persistence and management test hooks
also emit diagnostics so cleanup errors remain visible when a test fails as well.
The recorded Windows `EBUSY` lock's cause remains unconfirmed; these changes do not
guarantee that an external process cannot hold a file open.

## Investigation record

Record only observed results and label an unconfirmed cause as a hypothesis.
Do not include real credentials or user data in logs or fixtures.

```text
Test file and scenario:
Owner or responsible role:
First failure date and exact command:
Runtime, OS, configuration and synthetic fixture:
Failure evidence and reproduction steps:
Observed failures and passes, including the first failure:
Cause or current hypothesis:
Fix and regression evidence:
Local record or authorized issue reference:
Next review date and remaining work:
Checks not run or unavailable:
```

After a fix, repeat the relevant conditions and run the checks in the canonical
[validation policy](validation.md). Distinguish observed results from proposed
work and report any cleanup failure; this record does not waive a required check.

Recovery drills retain worker and cleanup failures together. Native-smoke cleanup reports failures from independently owned resources and keeps them when server shutdown cannot be confirmed. These failure-path tests use synthetic fixtures; they do not establish why a previous Windows file lock occurred.

Prefer deterministic readiness and isolated state over arbitrary delays or
repeated reruns. Do not hide a required failure with retries or
`continue-on-error`; record the first failure and any diagnostic rerun. Clean
only owned servers, temporary data and Docker resources as described in the
[Docker cleanup policy](../deploy/docker/README.md).
