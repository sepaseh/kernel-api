# API guidance

Start with [AGENTS.md](../AGENTS.md) and
[source navigation](../docs/source-navigation.md). Read only matching canonical
rules. [Settings](settings.json) indexes the published rules and skills;
[validation.json](validation.json) owns the current full profile.

The current foundation inventory publishes pure contracts, core modules, their
required port definitions and tests. Application rules apply to each owner when
it is published; their presence is not evidence of additional source or a
deployed API. Preserve unpublished local work and private runtime state.

Read [Git workflow](rules/git.md) for branch, commit, PR and review work.
Commit and push require authorization. Run the full current profile on the exact
proposed inventory before each authorized commit or PR. The foundation full
profile runs all ten real required checks, including source boundaries, types,
lint and source/tooling coverage. Each PR targets at most 80 files, with a hard
maximum of 100 after review fixes.

Dependent PRs may be published ready for review when explicitly requested while
provider results remain pending. Full CI applies to all PR targets; privileged
trusted guards apply only to `main`. Read [protection](../docs/branch-protection.md)
and [provider preflight](../docs/sonarqube.md) before claiming enforcement or
requesting review. Pending results never authorize merging.

Assistant instructions and maintained human documentation are English-only.
This index does not install hooks or prove automatic discovery by any assistant.
