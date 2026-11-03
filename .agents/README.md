# API guidance

Start with [AGENTS.md](../AGENTS.md) and
[source navigation](../docs/source-navigation.md). Read only matching canonical
rules. [Settings](settings.json) indexes the published rules and skills;
[validation.json](validation.json) owns the current full profile.

The current inventory declares the published source owners and their tests. Application rules apply to each owner when
it is published; their presence is not evidence of additional source or a
deployed API. Preserve unpublished local work and private runtime state.

Read [Git workflow](rules/git.md) for branch, commit, PR and review work.
Commit and push require authorization. Run the full current profile on the exact
proposed inventory before each authorized commit or PR. The full profile runs
every required check in the current manifest, including source boundaries,
types, lint and source/tooling coverage. Before opening a PR, aim for 80 or fewer files
and split independent changes when useful. File count is advisory: explain a
cohesive larger change in the PR; exceeding 100 alone does not fail CI or require
deleting or recreating the PR.

Dependent PRs may be published ready for review when explicitly requested while
provider results remain pending. Full CI and CodeQL apply to all PR targets;
main-branch protection applies to PRs targeting `main`. Read [protection](../docs/branch-protection.md)
and [provider preflight](../docs/sonarqube.md) before claiming enforcement or
requesting review. Pending results never authorize merging.

Assistant instructions and maintained human documentation are English-only.
This index does not install hooks or prove automatic discovery by any assistant.
