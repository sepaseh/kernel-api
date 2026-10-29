# API source-comprehension observations — 2026-10-24

[English](source-comprehension-2026-10-24.md) · [فارسی](source-comprehension-2026-10-24.fa.md)

This is a historical record concerning 24 October 2026. Its execution claims have not been independently verified and do not describe the current project state. See [validation](../validation.md) for current checks.

The dated record contains five API observations: three covered and two partially covered rubric cases. This page summarizes those existing records; it is not a new evaluation or a change to any recorded answer. Partial coverage includes details that were not explicit in the supplied questions and does not establish two runtime defects.

Instruction discovery was manual from the supplied directory. Automatic host loading was not measured. The subject reported no tests, app execution, network access, installation or source edits; the complete tool trace was not independently instrumented. Model/version, tokens, cost and response-time values remain unknown. These observations do not establish a general model-accuracy rate, runtime performance, linguistic quality or deployment readiness.

## Preserved input evidence

The input was recorded on 2026-10-24. Its fingerprint is:

`1405d707da7c48c2c7036e08432270db6433529d17b926952588eea4b32e5690`

The [machine record](../../.agents/evaluation/runs/2026-10-24-source-audit.json) preserves the exact five API records, supplied prompts, rubric, input revisions, source hashes and reported instruction reads. Recorded snapshot paths and hashes identify that dated input; they are not current navigation or a fingerprint of the current working tree.

The input preceded the API language-header correction. The subject described an unsupported raw Content-Language value alongside English emergency translation fallback. A later isolated regression/fix aligned header and translator resolution without rewriting persisted settings or changing public-DTO rejection. That finding describes the evaluated input and is not a current unresolved defect.

## Recorded API observations

| Case                      | Result  | Observation and qualification                                                                                                                                                                                                                                                       |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session-lifecycle         | covered | Opaque nonrotating sessions, native cookies and transactional all-session revocation were source-grounded.                                                                                                                                                                          |
| persisted-language        | covered | Settings authority, English defaults/preservation, ignored visitor preferences and public no-store DTO were covered. Subject additionally found old unsupported-code header/fallback mismatch; later fixed after this input snapshot.                                               |
| shared-label              | partial | Local common identity, ten catalogs, API {{variable}} syntax, engine boundary and erased imports were covered. Full distinction/preservation of both consumer interpolation syntaxes was not explicit; original prompt did not explicitly ask for both syntaxes.                    |
| administrator-concurrency | covered | Thin transport, framework-free policy and reread/count within real write transactions were correctly separated.                                                                                                                                                                     |
| private-media             | partial | Authorization, private URL/read policy, compensation, post-parse versus ingress bounds and owner-state exclusion were covered. Matched recovery point and new executable recovery/incident drill scope were omitted; they were in rubric but not explicit in the supplied question. |

Follow-up wording about interpolation distinctions and matched recovery/drill scope was clarified after these observations. It was not rerun or rescored against the same subject, and no numerical improvement is claimed. Use the current [evaluation method](../comprehension-evaluation.md) and [requirements audit](requirements-audit-2026-10-24.md) for present guidance and behavior.
