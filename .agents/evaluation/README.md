# Read-only guidance evaluation

The [cases](cases.json) define English prompts, source evidence and positive and
negative criteria. They are read-only exercises: use synthetic information and
never read real environments, databases, uploads, credentials or production.
The cases do not execute their listed checks. A passing static guidance check
does not establish automatic instruction loading or an assistant benchmark.

Use a fresh session for the `client-screen-contract` discovery probe. Supply only
its English prompt, without owner paths, expected answers or a preloaded chat.
Distinguish host-provided instruction loading from files the assistant later
opens. Missing host evidence makes automatic discovery unknown; supplied paths
are assisted discovery. Assess answer correctness separately against source.

Report the exact prompt, host/model/version when known, source scope, observed
reading trace, outcome and limitations in the current task. The
[run template](run-template.json) describes these fields and starts not-run/unknown.
Leave unknown values unknown. Save a local report only when explicitly requested,
under ignored `test-results/`; do not commit execution reports under docs or here.
The retired raw machine record remains available in Git history.

[Source navigation](../../docs/source-navigation.md) and
[validation](../../docs/validation.md) define ownership and executable checks.
The optional [CLAUDE.md](../../CLAUDE.md) references [AGENTS.md](../../AGENTS.md);
its presence does not prove that a host loaded instructions.
