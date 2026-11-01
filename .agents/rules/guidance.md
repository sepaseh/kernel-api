# Repository guidance and evidence

Read this rule when changing instructions, navigation, validation policy or
comprehension evaluation. Keep the starter assistant-neutral and do not make an
assistant or optional tool a runtime dependency.

## Canonical sources

- Observable HTTP behavior: the API-owned Bruno collection, local wire DTOs,
  owning-service routes and consumer/provider tests. Frontend repositories keep
  their own HTTP integration evidence; the Bruno collection and backend routes
  belong to the API repository.
- Runtime ownership: source, composition and executable boundary checks.
- Validation commands/profiles: `.agents/validation.json`. Other command lists are
  links or checked projections, never independent definitions of a complete gate.
- Task navigation: `.agents/navigation.json`; the readable guide is
  `docs/source-navigation.md`. Open owners and contracts, not just the map.
- Evaluation prompts are planned for a later publication; do not register absent
  evaluation files or claim they were executed in the governance phase.

When a document conflicts with current behavior, verify source and contracts,
correct the active explanation and report actual outcomes in the current task.
Never describe a proposed tool, template or past test as a current executed result.

## Progressive reading and verification

Root and scoped `AGENTS.md` files are short entry points that link canonical rules.
Assistant entry points, rules, skills, evaluation prompts and human documentation
are English-only. Maintain one canonical document per topic, with alphanumeric
words joined by hyphens or underscores and a single `.md` extension. The publication inventory
owns admitted paths. Do not add locale-specific discovery, compatibility paths,
validators, test fixtures or restoration instructions for documentation variants.
Application localization remains a separate concern.
The governance guide check reads only published inventory paths. Future
application validation must also cover its deployment and collection guides,
while excluding generated output and private runtime state before traversal.
`.agents/settings.json` inventories guidance; it does not register itself with every
assistant. Optional hooks are host-dependent fast checks, not a full validation gate.
The optional [CLAUDE.md](../../CLAUDE.md) adapter references AGENTS.md;
keep all rules in canonical sources. Do not add installers, plugins or remote
services merely for discovery. An adapter's presence does not prove a host loaded it.

Register only published task owners. Keep navigation paths relative to the
repository root and maintained Markdown links
relative to their file. Prefer symbol/path references over fragile line numbers in
living navigation; cite verified lines in actual task evidence. Update renamed paths,
affected tests and matching maintained human documentation in the same change.

The guidance checker can verify paths, indexes and command consistency. It cannot
prove that an assistant loaded instructions, that a semantic graph is complete, or
that the linked explanation remains factually correct. Record host-reported loaded
files where available; otherwise mark discovery unknown and follow the manual probe.

Use only synthetic disposable fixtures. Do not read real environments, credentials,
ignored databases or object stores to answer comprehension questions. Do not claim
all-client portability or improved agent performance without measured evidence.

## Local ownership and evidence

This repository owns its contracts, catalogs, tests and operating instructions.
HTTP changes require compatibility review with affected consumers. Maintained API
Markdown is checked for safe local links, including nested operating guides.
Display QA/test outcomes in the terminal or current chat by default. Keep docs for
current guides and do not commit execution reports. Create a local report only
when explicitly requested, under ignored `test-results/`; required coverage stays
in its configured location.

## Change acceptance and test failures

Use the change checklist (planned path: `docs/feature-development.md`) to distinguish required behavior, proposals and provider-dependent work, and link observable acceptance scenarios to the canonical checks. Use [test reliability](../../docs/test-reliability.md) to record ownership, first failures, reproduction and time-bounded exceptions. These are portable workflows, not automatic assistant discovery, flaky-test detection or permission to weaken a required gate.
