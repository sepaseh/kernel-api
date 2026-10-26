# Branch protection policy

[English](branch-protection.md) · [فارسی](branch-protection.fa.md)

Use the existing GitHub, CodeRabbit and SonarQube Cloud integrations. Merging
requires successful CI, the required native provider checks, an approving review
and resolved conversations. Protection applies to administrators, dismisses stale
approvals, requires an up-to-date branch and linear history, and prohibits force
pushes and deletion.

The governance phase requires **Bootstrap governance (API not published)** and
**SonarQube Cloud analysis** from GitHub Actions, plus **SonarCloud Code Analysis**
from the SonarQube Cloud app. The native **CodeRabbit** status is also required.
Replace phase-specific CI requirements only when their actual successor checks
have been verified; never remove a required check just to merge incomplete work.

A CodeRabbit progress status can be successful for a skipped review. Inspect the
actual review and resolve actionable findings; request a manual review when
automatic review skips, and respect quotas. CodeRabbit's configured automatic
approval can supply the required approving review after its review completes.
A generic GitHub approval requirement accepts other eligible reviewers too; this
ordinary policy does not claim to require a particular bot's identity.

No dedicated approval App, external publisher or custom approval-gate check is
used. CI and Sonar results must apply to the current PR commit. Missing or failed
required checks keep merging blocked; do not remove required checks to bypass a
failure. CODEOWNERS suggests reviewers without configuring protection by itself.
