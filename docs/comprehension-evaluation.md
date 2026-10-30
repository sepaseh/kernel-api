# API source comprehension cases

[English](comprehension-evaluation.md) · [فارسی](comprehension-evaluation.fa.md)

[The case definitions](../.agents/evaluation/cases.json) describe five read-only
tasks: tracing authentication and session revocation, explaining persisted-language
behavior, examining administrator concurrency, planning a client-screen HTTP contract,
and distinguishing synthetic recovery drills from deployed evidence.
Each case lists relevant task IDs, source evidence, expected explanations, boundaries
and check identifiers. Check identifiers point to possible later validation; the
read-only cases themselves do not run tests. The definitions are guidance for a
review, not a benchmark result or evidence that any assistant executed the tasks.

Do not read private environment files, existing user data or production state.
Use the current [task map](../.agents/navigation.json) and
[validation manifest](../.agents/validation.json); a listed check must actually be
run before its outcome is reported. Do not claim production OTP delivery or an
operator backup was performed based on these cases.

When evaluating instruction discovery, record separately what the host supplied automatically and what the reviewer opened later. Mark discovery as unknown when it cannot be observed; a correct answer or a passing guidance check alone does not establish automatic loading.
