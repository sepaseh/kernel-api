# Guidance and documentation

Use [AGENTS](../../AGENTS.md), the [settings index](../settings.json) and
[source navigation](../../docs/source-navigation.md) for progressive reading.
Read the owner source and tests; index entries and static links do not prove
behavior or successful execution.

Keep assistant instructions and maintained documentation English, current and
organized by reader task. Use [source navigation](../../docs/source-navigation.md)
to select the existing owner. Update that owner alongside behavior, configuration,
test or workflow changes. Procedures state prerequisites, actions, expected
results and relevant recovery; references define contracts; explanations describe
ownership and reasoning. Verify changed claims against source and nearby tests.
Do not add routine dated QA reports, archives, ADRs, translated companion guides
or bilingual navigation. Application localization remains a separate concern.

Use repository-relative machine paths and document-relative Markdown links.
Link maintained current files, not future or deleted paths. Register only
published owners, tests, rules, skills and actual check IDs. The publication
inventory owns admitted paths; generated output and private runtime state are
never documentation fixtures. Keep human guides flat and task-oriented.

The [manifest](../validation.json) owns commands and profiles; settings project
that inventory. Do not duplicate an independent complete gate or fixed count.
Optional host adapters and hooks need actual integration; they do not grant
authorization, install themselves automatically or replace the full gate.

Report execution outcomes and evidence limits in the current task or terminal.
Do not commit execution reports. Create a local report only when explicitly
requested, under ignored `test-results/`; required coverage stays in its configured
location. Keep repository-specific scratch exports, validation evidence and
recovery files inside ignored repository-local directories.

Static checks establish paths, indexes and command consistency. They do not prove
that a host loaded instructions, that an assistant understood them, that a
provider completed analysis or review, or that an application ran. Record actual
host-reported loading where available and otherwise mark discovery unknown.
Keep evaluation prompts separate from oracle answers. Use only synthetic
fixtures; never inspect secrets or owner data to answer evaluation questions.
Do not claim portability or improved performance without measured evidence.

The API owns observable HTTP behavior through its Bruno collection, local wire
DTOs, owning-service routes and consumer/provider tests. Frontend repositories
own their HTTP integration evidence. Source, manual composition and executable
boundary checks establish runtime ownership. HTTP changes need compatibility
review with independently released consumers.

Maintain one canonical document per topic with alphanumeric words joined by
hyphens or underscores and one `.md` extension. Do not add locale-specific
discovery, compatibility paths, validators, fixtures or restoration instructions
for documentation variants. The guide check reads admitted inventory paths,
including deployment and collection guides. Generated output and private runtime
state remain outside that inventory and must not be traversed for guidance validation.

The optional [CLAUDE.md](../../CLAUDE.md) adapter references AGENTS.md; canonical
rules remain the owners. Do not install plugins or remote services for discovery.
The read-only evaluation [guide](../evaluation/README.md),
[cases](../evaluation/cases.json) and [run template](../evaluation/run-template.json)
are published. Their static validation does not execute the prompts; the blank
template remains not-run with instruction discovery unknown.
Use the [feature-development checklist](../../docs/feature-development.md) for
change acceptance and [test reliability](../../docs/test-reliability.md) for
ownership, first failures, reproduction and bounded exceptions without weakening the gate.
