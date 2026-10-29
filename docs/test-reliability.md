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
