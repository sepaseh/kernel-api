# Assistant guidance

Start with [AGENTS.md](../AGENTS.md) and [Contributing](../CONTRIBUTING.md).
Read the [publication policy](../.github/bootstrap-policy.json) for the active
phase, readiness and admitted files. The [settings index](settings.json) lists
the registered rules and skills.
The [task map](../docs/source-navigation.md) maps work to source owners, tests and checks.

| Task                                                    | Where to start                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Work on application source                              | [Backend rules](rules/backend.md) and [development guide](../docs/development.md)                                                            |
| Update instructions or documentation                    | [Guidance and documentation](rules/guidance.md) and [documentation index](../docs/README.md)                                                 |
| Verify a change                                         | [Validation guide](../docs/validation.md), [validation manifest](validation.json) and [validation workflow](skills/validate-change/SKILL.md) |
| Work with Git or GitHub                                 | [Git workflow](rules/git.md) and [safety rules](rules/safety.md)                                                                             |
| Prepare a CodeRabbit request                            | [CodeRabbit preflight](rules/pull-requests.md#coderabbit-request-preflight)                                                                  |
| Set up optional hooks or evaluate instruction discovery | [Host adapters and hooks](rules/guidance.md#host-adapters-and-hooks) and the [read-only evaluation guide](evaluation/README.md)              |

## Published scope

Confirm claims against admitted source and its actual tests. Follow the
[repository instructions](../AGENTS.md#published-scope) when changing which
files are published.
