# Issues

An issue is a durable handoff, not a transcript.

- Use a bug report when observed behavior contradicts expected behavior; use a
  change proposal for planned work, maintenance, refactoring, or documentation.
- State the impact, affected workflow, observed behavior, expected outcome,
  strongest available evidence, and objective verification.
- Keep one issue focused on one independently verifiable outcome. Search for
  duplicates before publishing.
- Separate facts, inferences, and unanswered questions. Do not invent
  reproduction steps, severity, or acceptance criteria.
- Exclude credentials, tokens, personal data, production payloads, and sensitive
  security details. Follow `SECURITY.md` for suspected vulnerabilities.

Use a specific outcome-oriented title, without redundant type/priority/assignee
prefixes. For a bug, cover summary, impact, observed/expected behavior, reproduction
or evidence, environment and verification. For a proposal, cover problem, desired
outcome, acceptance criteria, scope/constraints and context. Omit optional empty
sections; mark required unknown facts as unknown with what was checked.

Search both open and closed issues. Use related-work links for context and blocking
language only for a true dependency. Verify existing labels/templates before using
them; do not assume forms or metadata exist. Do not prescribe an implementation
unless its constraint is already decided. Publishing or modifying remote metadata
requires authorization; a finding or draft request alone does not authorize it.
