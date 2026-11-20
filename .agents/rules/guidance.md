# Guidance and documentation

Use the [guidance index](../README.md) to find the owning rule and published
source for each change.

## Write and maintain guides

Keep assistant instructions and maintained documentation in English, current and
organized by reader task. Update the owning guide alongside behavior,
configuration, test or workflow changes. Verify changed claims against the
owning source and nearby tests.

Procedures state prerequisites, actions, expected results and relevant recovery.
References define contracts. Explanations describe ownership and reasoning.

Do not add routine dated QA reports, archives, ADRs, translated companion guides
or bilingual navigation. Application localization remains a separate concern.

Use descriptive headings and label code fences with their language.

Keep shared requirements in the owning rule. Link to its relevant section from
indexes, related rules and skills. Keep workflow-specific steps with the skill
that executes them. Keep human guides flat and task-oriented.

## Maintain indexes and optional integrations

Use repository-relative machine paths and document-relative Markdown links to
current files. Register only published owners, tests, rules, skills and actual
check IDs. Use admitted public source and synthetic fixtures for examples.
Follow the [fixture safety rules](safety.md#secrets-and-local-state).

The [validation manifest](../validation.json) owns commands and profiles.
Settings project that inventory. Refer to the manifest for the full gate and
keep prose free of a separate gate inventory or check count.

Use descriptive links for maintained files in the [publication inventory](../../.github/bootstrap-policy.json).
Maintain one canonical document per topic with alphanumeric words joined by
hyphens or underscores and one `.md` extension. Do not add locale-specific
discovery, compatibility paths, validators, fixtures or restoration instructions
for documentation variants. The guidance check reads admitted paths, including
deployment and collection guides. Exclude generated output and private runtime
state from documentation fixtures and guidance validation.

For changes to HTTP behavior, follow the
[contract update rule](api-collection.md#change-a-contract). Use the
[backend ownership rule](backend.md#ownership-and-dependency-direction) to
trace the runtime and boundaries.

## Verify evidence and results

Report execution outcomes and evidence limits in the current task or terminal.
Do not commit execution reports. Create a local report only when explicitly
requested, under ignored `test-results/`. Required coverage stays in its
configured location. Use the [working-checkout rule](branches.md#working-checkout)
for scratch exports and recovery files.

Static guidance checks verify published paths, local Markdown links and section
anchors, indexes and command consistency. Support claims about instruction loading, application behavior, provider results,
portability or performance with evidence from the relevant execution.

Follow the [validation workflow](../skills/validate-change/SKILL.md) to run and
report the relevant checks.

Use the [feature-development checklist](../../docs/feature-development.md) for
change acceptance and [test reliability](../../docs/test-reliability.md) for
ownership, first failures, reproduction and bounded exceptions.

## Host adapters and hooks

The optional [CLAUDE.md](../../CLAUDE.md) adapter references AGENTS.md; canonical
rules remain the owners. Do not install plugins or remote services for discovery.
Register optional hooks in [settings](../settings.json) and configure them
explicitly on the host. Their portable tests use synthetic fixtures. Follow
[safety](safety.md) for the limits of optional hooks and the
[evaluation guide](../evaluation/README.md) to measure instruction discovery.
