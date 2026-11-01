# API guidance

Start with [AGENTS.md](../AGENTS.md) and
[source navigation](../docs/source-navigation.md). Read only matching canonical
rules. [Settings](settings.json) indexes the published rules and skills;
[validation.json](validation.json) owns the current full profile.

The published scope is governance only. Application rules describe constraints
for later source PRs, not evidence of a published or deployed API. Keep runtime
source, data, environments and deployment artifacts out of the first PR.

Read [Git workflow](rules/git.md) for branch, commit, PR and review work.
Commit and push require authorization. Run the full current profile on the exact
proposed inventory before each authorized commit or PR. The first PR targets at
most 80 files, with a hard maximum of 100 after review fixes.

Assistant instructions and maintained human documentation are English-only.
This index does not install hooks or prove automatic discovery by any assistant.
