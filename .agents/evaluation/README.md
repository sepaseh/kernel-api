# Read-only guidance evaluation

The [cases](cases.json) define English prompts, source evidence and answer
criteria. Static guidance validation checks these references. The case files
record check IDs for reference. Run each prompt separately from static validation.

## Run a case

Keep the evaluation read-only and use only public source and synthetic fixtures.
Follow the [fixture and private-state rules](../rules/safety.md#secrets-and-local-state).
Keep prompts separate from evidence and expected answers.

For the `client-screen-contract` discovery probe, give the assistant a fresh
session and supply only the English prompt. Keep owner paths, expected answers,
scoring criteria and preloaded chat outside its input.

Distinguish host-reported instruction loading from files the assistant opens
during the trial. Supplied paths count as assisted discovery. Mark automatic
discovery unknown when host evidence is missing. Verify the answer independently
against the mapped source and tests.

## Record results

Report the exact prompt, host, model, version when known, source scope, observed
reading trace, outcome and limitations in the current task. The
[run template](run-template.json) describes these fields and starts not-run/unknown.
Leave unknown values unknown. Follow the
[reporting policy](../rules/guidance.md#verify-evidence-and-results) for saving
local results.

[Source navigation](../../docs/source-navigation.md) and
[validation](../../docs/validation.md) define ownership and executable checks.
For optional host setup, see [host adapters and hooks](../rules/guidance.md#host-adapters-and-hooks).
