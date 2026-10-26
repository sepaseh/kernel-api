# Branch protection policy

[English](branch-protection.md) · [فارسی](branch-protection.fa.md)

Merging requires successful CI, CodeRabbit approval of the exact current PR head,
a passing SonarQube Cloud quality gate for that head and resolved review threads.
Missing, pending, failed, skipped or quota-limited evidence keeps merging blocked.
The policy applies to administrators, dismisses stale approvals, requires an
up-to-date branch and linear history, and prohibits force pushes and deletion.

The governance phase requires **Bootstrap governance (API not published)** and
**SonarQube Cloud analysis** from GitHub Actions, plus **SonarCloud Code Analysis**
from the SonarQube Cloud app. The additional **Review approval gate** must come
from the separately trusted publisher described in [gate operations](review-gate.md).
Replace phase-specific CI requirements only when their actual successor checks
have been verified; never remove a required check just to merge incomplete work.

A generic approval count cannot require a named bot, and CodeRabbit can report a
successful progress status for a skipped review. The trusted publisher checks the
verified bot identity, an actual `APPROVED` review on the exact head, current CI
and Sonar results, complete thread pagination and stable head/base revisions.
It cannot use PR-controlled source, policy or signing credentials.

The initial empty `main` cannot supply trusted workflow code. Until the separate
publisher is installed and connected, the required approval-gate context remains
unfulfilled and PRs stay blocked. Do not let a PR-head workflow authorize its own
merge or remove this blocker to bootstrap the repository. CODEOWNERS remains a
review suggestion; it does not replace these enforced conditions.
