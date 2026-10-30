# Guidance discovery and source evaluation

[English](comprehension-evaluation.md) · [فارسی](comprehension-evaluation.fa.md)

Start with root AGENTS, source navigation, the machine task map and matching rules.
The seven read-only API cases in .agents/evaluation/cases.json identify local source,
observable positive/negative criteria and relevant checks. Use synthetic fixtures
only; private environments, developer DB/storage and production are not inputs.
Active evaluation prompts and assistant guidance are English-only. This guide's
Persian companion explains the workflow for human readers; it does not duplicate
the evaluation prompts.

.agents/evaluation/run-template.json starts not-run/unknown. A real evaluation
records host/model/version when known, actual instruction discovery, the source
revision and dirty-source fingerprint, index scope, per-case evidence and limits.
Leave unknown values unknown. Do not infer results from a template or change a
recorded outcome after changing a question.

The guidance checker verifies paths, indexes and command consistency. It does not
prove automatic host discovery, explanation quality or an assistant benchmark.
[Source navigation](source-navigation.md) and [validation](validation.md) define
current ownership and executable checks.

The read-only cases do not run their listed checks; report an outcome only after
the check actually runs. They do not establish production OTP delivery or that
an operator backup was performed.

## Read-only screen-contract discovery probe

Use the `client-screen-contract` case in a fresh session for each host being
evaluated. Supply only its English prompt, without owner paths, expected answers
or a preloaded conversation. The task plans a branding/logo/language screen from
API evidence; it does not change files, start services or access real state.

Record discovery separately from answer correctness in the existing run template. Use `exactPrompt` for the initial prompt, `instructionDiscovery` for automatic loading and the observed reading/navigation trace, and `assistedDiscovery` for a separate attempt with its own prompt, supplied paths, trace and evidence. Leave `attempted` as `null` until that attempt is assessed.

- Record host/model/version when known, source fingerprint and the exact prompt.
- Distinguish instruction files automatically supplied by the host from files the
  assistant subsequently opens. Preserve host-reported loading evidence and the
  visible reading/navigation trace; an assistant's unsupported claim is insufficient.
- When initial loading cannot be observed, mark automatic discovery unknown.
  Providing paths manually is assisted discovery; record it as a separate attempt.
- Assess the answer against the case's source-backed positive/negative criteria.
  A correct answer or passing guidance check alone cannot prove automatic loading.

The optional [CLAUDE.md](../CLAUDE.md) imports
[AGENTS.md](../AGENTS.md). It contains no separate rules. Its presence and the evaluation case are configuration,
not a recorded native Codex/Claude run or a portability/performance claim.
