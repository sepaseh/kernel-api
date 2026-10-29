# API guidance

Start with [AGENTS.md](../AGENTS.md) and [source navigation](../docs/source-navigation.md).
Read the rules relevant to the task. [settings.json](settings.json) indexes the
guidance; [validation.json](validation.json) owns the validation commands. Use
the smallest relevant check during development and the full profile before an
authorized commit or push. Preserve unrelated local state and do not read real
environment files or user data.

The rules and skills describe assistant-neutral workflows; they are not runtime
dependencies. Human-facing documentation has English and Persian versions.
The [evaluation cases](evaluation/cases.json) are prompts, not evidence that an
assistant or a production system has been evaluated.
