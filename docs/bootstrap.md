# Repository governance bootstrap

[English](bootstrap.md) · [فارسی](bootstrap.fa.md)

The published project is in the **governance** phase. Its exact inventory is
[bootstrap-policy.json](../.github/bootstrap-policy.json). It establishes review
automation; the API runtime, database migrations and HTTP collection are not
published or validated by these checks. Application readiness remains false.

Use Node.js from [.nvmrc](../.nvmrc), without npm installation or environment files:

```sh
node scripts/validate-bootstrap.mjs
node --test scripts/check-pr-size.test.mjs scripts/validate-bootstrap.test.mjs
```

Validate an isolated checkout or export of the exact proposed commit before
generating coverage. The validator rejects unexpected/missing files, symlinks,
private paths and invalid JSON/JavaScript. Untracked files outside that snapshot
must not make an incomplete PR appear green.

The [bootstrap workflow](../.github/workflows/bootstrap.yml) generates actual
`coverage/lcov.info` using Node's built-in reporter. This is governance-script
coverage, not API application coverage. Generated reports are not committed.

## Pull request cycle

1. Work on a focused `codex/<purpose>` branch and inspect its complete base diff.
2. Keep the GitHub changed-file count at **100 or fewer**. Added, removed, renamed
   and binary files all count; GitHub represents a rename as one changed entry.
3. Validate the exact proposed snapshot and the checks for its declared phase.
4. Push and create the PR with the [template](../.github/PULL_REQUEST_TEMPLATE.md),
   actual verification evidence and limitations. Keep incomplete work in draft.
5. Read CodeRabbit findings, fix actionable defects and rerun affected checks.
   A skipped bot review is not a completed review.
6. Verify the actual Sonar analysis and quality-gate result when configured.
   Missing setup, unavailable analysis and failed analysis are distinct states.
7. Merge after required checks and owner review. Automatic merging, deployment
   and release tagging are not enabled by this bootstrap.

The [PR policy](../.github/workflows/pr-policy.yml) runs trusted default-branch
code with read-only permissions. Complete pagination and a stable PR head/base
are required; incomplete API responses fail the check. The first PR also runs an
unprivileged head-branch size check because its empty base lacks the policy.

Runtime source requires a reviewed phase transition with coherent dependencies
and validation on the actual committed tree. Do not broaden the governance
allowlist and claim that application behavior passed. Activate the API's full
canonical validation and synthetic DB/auth/storage tests when its runnable phase
is introduced. Preserve the 100-file cap and document prerequisite PRs. Bootstrap
checks never replace required runtime checks or justify placeholder behavior.

See [Sonar setup](sonarqube.md).
