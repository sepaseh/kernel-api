# Branch protection policy

[English](branch-protection.md) · [فارسی](branch-protection.fa.md)

Use the existing GitHub, CodeRabbit and SonarQube Cloud integrations. Merging
requires successful CI, the required native provider checks, an approving review
and resolved conversations. Protection applies to administrators, dismisses stale
approvals, requires an up-to-date branch and linear history, and prohibits force
pushes and deletion.

The non-runnable storage-adapters phase requires **check** and
**PR file limit** from GitHub Actions and
**SonarQube Cloud analysis** from GitHub Actions, plus **SonarCloud Code Analysis**
from the SonarQube Cloud app. The native **CodeRabbit** status is also required.
Keep the existing required contexts and their provider identities unchanged;
never remove a required check just to merge incomplete work.

A CodeRabbit progress status can be successful for a skipped review. Inspect the
actual review and resolve actionable findings. Before any manual request or
re-review, complete the [CodeRabbit preflight](sonarqube.md#before-requesting-coderabbit):
all required non-CodeRabbit checks, scanner and actual Sonar quality gate must pass
for the current head, with zero open/unresolved Sonar issues at all severities,
including existing issues. Missing/skipped/pending evidence blocks requests;
new commits invalidate it. Respect quotas and one in-flight request per head;
do not weaken requirements or use automatic triggers to bypass this order.
CodeRabbit's configured automatic
approval can supply the required approving review after its review completes.
A generic GitHub approval requirement accepts other eligible reviewers too; this
ordinary policy does not claim to require a particular bot's identity.

No dedicated approval App, external publisher or custom approval-gate check is
used. CI and Sonar results must apply to the current PR commit. Missing or failed
required checks keep merging blocked; do not remove required checks to bypass a
failure. CODEOWNERS suggests reviewers without configuring protection by itself.
