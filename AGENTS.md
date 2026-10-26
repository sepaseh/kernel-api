# Kernel API foundation instructions

Read [README](README.md), [Contributing](CONTRIBUTING.md), the current
[publication inventory](.github/bootstrap-policy.json) and the canonical
[validation manifest](.agents/validation.json) before changes.

This standalone npm project currently publishes pure HTTP contracts, application
primitives and ports. Keep dependencies between these modules local and framework
free. The HTTP server, database, concrete adapters and feature services belong to
later reviewed publication phases; do not claim they have passed foundation tests.

Run `npm run validate -- full` before an authorized commit or PR. Test the exact
proposed tree. Keep each PR at 100 or fewer changed files, including deletions and
renames; the total repository may grow beyond 100 files. Preserve private state,
never read real environment files or credentials, and require explicit user
authorization for commits, pushes, remote comments and merging.

Use ordinary CodeRabbit, SonarQube Cloud and CI checks. Keep assistant guidance in
English and maintained human documentation in English and Persian. Runnable API
publication must add its complete HTTP, database, authentication, storage and
architecture validation before declaring application readiness.
