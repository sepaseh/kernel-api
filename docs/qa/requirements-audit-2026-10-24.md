# API requirements audit — 24 October 2026

[English](requirements-audit-2026-10-24.md) · [فارسی](requirements-audit-2026-10-24.fa.md)

This is a historical record concerning 24 October 2026. Its execution claims have not been independently verified and do not describe the current project state. See [validation](../validation.md) for current checks.

This audit distinguishes implemented API capabilities, implementation owners,
executed checks and operator/provider-dependent work. [Local verification](independent-api-verification.md)
is dated execution evidence, not a claim of hosted-service operation.

| Requirement                                                                                | Current status                                              | Owning implementation and verification                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent backend; frontends consume HTTP                                                | Implemented                                                 | `src/`, local contracts/catalogs and lockfile; `scripts/check-boundaries.mjs`; API implementation is not copied into frontend runtimes.                                                                                                                                     |
| Lightweight Clean architecture, Hono only at transport, manual composition                 | Implemented and checked                                     | `src/application`, feature ports, concrete infrastructure, `src/presentation/http`, `src/composition.ts`; `architecture.test.ts` enforces static/dynamic/type-only and global HTTP-type boundaries.                                                                         |
| SQLite/Drizzle migrations and preserved local state                                        | Implemented                                                 | `infrastructure/db/{client,initialize,schema}.ts`, reviewed `drizzle`; developer DB/uploads are excluded from fixtures; fresh English settings do not overwrite existing settings.                                                                                          |
| Better Auth login/logout, password change/reset and native sessions                        | Implemented; OTP-dependent public flows are provider-gated  | `application/auth.ts`, auth gateway and transactional auth persistence; `auth-application`, `auth-gateway`, `auth-invariants` tests cover cookies, outages, atomic password/OTP/session operations.                                                                         |
| User/role permissions and final active administrator safety                                | Implemented and checked                                     | Users/roles application and persistence adapters; real-DB race tests in `auth-invariants.test.ts`; use-case tests in `users-application.test.ts`.                                                                                                                           |
| Profile/email verification, settings and calendar                                          | Implemented; email OTP delivery is provider-gated           | `application/{account,settings,calendar}.ts`; management/HTTP/auth tests; optional email and configured-language policy retained.                                                                                                                                           |
| File bytes outside DB; local/S3-compatible storage; public/private policy and compensation | Implemented locally; external storage deployment unexecuted | Files service/feature ports, local/MinIO adapters and HTTP routes; real local and fake-provider tests, safe attachment headers, public authorization and metadata-failure compensation. Media transcoding, actual signature scanning and a video CMS are product additions. |
| Shared field bounds and pre-write validation                                               | Implemented and checked                                     | Framework-free contract limits; `application/validation.ts`; `validation.test.ts` and `input-validation-http.test.ts` exercise malformed/supplied/oversized inputs and omitted patches.                                                                                     |
| Ten complete genuine API catalogs and application type-only vocabulary                     | Implemented and checked                                     | API-local catalogs and pure message vocabulary; five focused catalog tests plus architecture guard. Local copies may evolve independently; no shared registry/synchronization requirement.                                                                                  |
| Structured redacted logging, request/release correlation and lifecycle                     | Implemented and checked                                     | Logging/sanitization, request middleware, lifecycle; `logger`, `request-logging`, `lifecycle` tests. Collector/alerts/security audit store remain deployment decisions.                                                                                                     |
| Independent Docker/native delivery, TLS, bootstrap, immutable artifacts, persistence       | Implemented; bounded earlier execution recorded             | `deploy/`, packaging/preflight/render/health/bootstrap and deployment tests; Linux Docker and relocated Windows payload were exercised previously. Linux systemd/DNS/real certificates/production promotion have not run.                                                   |
| Cleanup after Docker tests                                                                 | Implemented with regression and prior real lifecycle proof  | Per-run builder/cache, exact owned tags/containers/Compose resources/TEMP; cleanup continues after failures and ordinary interruption, never globally prunes other projects.                                                                                                |
| Coordinated isolated recovery exercise                                                     | Newly implemented                                           | `recovery-drill.test.ts`: closed DB/object snapshot, mismatched point rejection, integrity/migration checks, recovered session/roles/calendar/language and public/private objects. Required by existing `server:test`/CI discovery.                                         |
| Synthetic incident exercise                                                                | Newly implemented with bounded API scope                    | Same test file: actual in-process HTTP upload failure and recovery correlated with request ID, immutable release and redacted storage/final request logs. It does not claim a new browser/collector/remote incident drill.                                                  |
| Assistant-neutral guidance, navigation, checks, ADRs and evaluation cases                  | Implemented/configured                                      | `.agents/`, root instructions, canonical validation/CI projection, five active read-only API cases. Static gates run locally; no fresh independent assistant benchmark or universal automatic discovery is claimed.                                                         |
| CI/security/manual release controls                                                        | Configured; hosted runs/operator setup unexecuted           | Pinned CI/CodeQL/Dependabot, CODEOWNERS, manual release/staging/smoke/DAST/Sonar templates. Branch protection, account entitlements, credentials and production scheduling remain operator work.                                                                            |

All source paths above are repository-root-relative or relative to `src/` when abbreviated. Public HTTP behavior remains
evidenced by Bruno collection, wire DTOs and provider/HTTP tests. Website SEO/CSP,
browser performance/UI accessibility/visual baselines and admin request behavior
belong to their respective frontend repositories; they do not belong in Hono.

Follow-up source review found one response-metadata defect after the independent
source-reading input snapshot: an unsupported persisted language already fell back
to English messages but advertised the unsupported value in `Content-Language`.
The HTTP/localization boundary now resolves both to English. Public settings still
reject the invalid stored value, and an authorized update remains possible without
automatic DB repair. A hermetic `auth-invariants.test.ts` regression reproduces the
old mismatch, checks English error/repair response headers and confirms subsequent
Persian responses after repair. This preserves the deliberate backend emergency
fallback and the website's separate explicit-error policy; see
[API localization](../localization.md).

Change handoff and test-ownership workflows are covered by the local
[requirements handoff and implementation plan](../change-workflow.md) and
[test reliability/flaky ownership policy](../test-reliability.md). These are
concrete templates/policies, not a hosted task service or proof that a future
change followed them.

## Executed during this re-audit

- The existing API suite passed all 109 cases before the new drills; the four
  architecture and nine catalog-integrity cases also passed independently.
- `npm run validate -- full` passed all 15 required checks after the additions
  and language-metadata correction: 113 API cases, 16 selected contract cases,
  39 deployment cases, 18 tooling
  cases, 14 guidance cases, six boundary regressions and nine catalog cases;
  the boundary gate also ran four architecture cases. Some commands overlap;
  these are per-command counts, not a sum of unique tests. Typecheck, lint,
  formatting, Knip and the native-TypeScript build gate passed.
- `npm run test:recovery` passed all three new recovery/incident cases. Each
  uses a bounded child process and its verified TEMP tree is removed after exit;
  typechecking, Knip and guidance also passed after the additions.
- A fresh canonical online audit completed with zero high/critical and four
  moderate findings through MinIO: `minio`, `query-string`,
  `decode-uri-component` and `stream-json`. The required gate uses
  `--audit-level=high`; a successful exit does not mean zero findings.

## Remaining decisions and recommendations

1. Choose and implement a real OTP delivery provider before public registration,
   password recovery or email verification goes live. Current production refuses
   the fixed development code and fails explicitly without delivery. Do not add a
   fake send-success adapter merely to label the feature complete.
2. Plan a separately verified MinIO SDK dependency migration/upstream fix for the
   four moderate findings. The audit's offered downgrade is not an automatically
   compatible patch; no dependency override or suppression was used here.
3. Rehearse the chosen actual storage service, protected secret recovery and
   deployment-specific retention/RPO/RTO. The new synthetic local exercise does
   not prove a production backup schedule, MinIO policy restore or Linux host.
4. Configure the deployment's collector/alerts and join frontend error evidence
   with API correlation IDs when needed. Add immutable audit events only for a
   concrete product/compliance requirement.
5. Keep optional source-understanding tools outside the runtime. A new evaluation
   requires actual evidence under the [evaluation method](../comprehension-evaluation.md).
