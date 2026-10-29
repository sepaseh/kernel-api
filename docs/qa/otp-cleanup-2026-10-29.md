# OTP test cleanup incident — 2026-10-29

[English](otp-cleanup-2026-10-29.md) · [فارسی](otp-cleanup-2026-10-29.fa.md)

This report records one local test incident and subsequent checks on the tree
published as commit `a213951b446cad00cb4c7eaa542c16cf0e764bce`. These results
are historical evidence for that tree, not a current verification or a claim
that the cause was fixed.

## Observation

On Windows 10.0.26200 with Node.js v24.18.0 and npm 12.0.2,
`npm run validate -- full` failed before the commit was created. The test
`concurrent OTP issuance across database connections remains atomic` in
`scripts/auth-bootstrap-integration.test.mjs` encountered `EBUSY` while its
cleanup attempted to unlink the synthetic temporary `otp.db`. The test run
reported 447 passed, one failed and two skipped; the full profile stopped at
the failed coverage-tests step. The failure was reported in cleanup, not as an
OTP concurrency assertion failure. The owner and cause of the file lock were
not established.

The focused test subsequently passed using:

```sh
node --test --test-name-pattern='concurrent OTP issuance across database connections remains atomic' scripts/auth-bootstrap-integration.test.mjs
```

After the lock cleared, the remaining test-owned temporary file and its empty
directory were removed. Two later full-profile runs on the same proposed tree,
one before and one after creating the commit, succeeded: each coverage suite
reported 448 passed, no failures and two skipped symlink tests due to Windows
permissions. Both full profiles included the audit-helper tests. The
[Linux CI check](https://github.com/sepaseh/kernel-api/actions/runs/40822580282/job/123278172521)
for the commit passed all 450 coverage tests, including the symlink tests.

## Follow-up and limits

A passing rerun does not establish why the Windows handle remained open, nor
does Linux success prove the issue cannot recur on Windows. Investigate with a
controlled reproduction using only a fresh owned fixture; identify which process
or handle retains the file and verify cleanup on success and failure. Do not
weaken assertions or hide required failures by repeatedly rerunning until green.
Follow [test reliability](../test-reliability.md) and report the first failure
and actual cleanup outcome.
