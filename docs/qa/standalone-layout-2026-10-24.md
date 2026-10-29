# API runtime verification — 2026-10-24

[English](standalone-layout-2026-10-24.md) · [فارسی](standalone-layout-2026-10-24.fa.md)

This is a historical record concerning 24 October 2026. Its execution claims have not been independently verified and do not describe the current project state. See [validation](../validation.md) for current checks.

This report records local execution on the date above. Counts apply to that run
and are not fresh results for later source.

## Verification

All 15 required profile gates passed after a clean root `npm ci`: 118 API tests (including five local catalog tests), 16 HTTP contract tests, 36 deployment tests, six source-boundary tests, four architecture tests and 15 guidance regressions. Typecheck, lint, format, Knip and build passed. The focused tooling suite passed all 14 API cases. The dependency audit retains four existing moderate findings and zero high/critical findings.

The production native package passed a real disposable install of 153 production dependencies, preflight, migration, administrator bootstrap, health and login check. Its release directory and temporary fixture were cleaned.

The real root-layout Docker smoke passed: HTTPS, immutable release markers, first-administrator bootstrap and duplicate-bootstrap rejection, sessions, origin checks, explicit unavailable OTP delivery, public/private storage and persistence after container replacement. It built the root production lockfile/source/migrations in the actual Linux image. The optional external Dockerfile frontend directive was removed; standard instructions use the bundled BuildKit frontend. All 36 deployment regressions passed again after this change.

All five disposable builders from these attempts were confirmed absent. Test containers, custom networks, volumes, application images, builder caches and Docker fixtures were removed; the newly pulled shared BuildKit tool image was also removed after the test suite. Final Docker inventory was zero images, containers, volumes and build-cache bytes. No global prune was used.

## Evidence limits

These outcomes do not establish hosted CI, production rollout, Linux systemd
activation, manual screen-reader certification or provider integrations. Docker
cleanup remains exact-resource cleanup after success/failure, without global prune.
