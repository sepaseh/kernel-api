# Security review and checks

For changes to a trust boundary, use the [threat model](threat-model.md); for
authentication changes, use the [session checklist](authentication-review.md).
Review findings according to exploitability, exposure and release impact. Record
an owner and resolution; do not treat a checked-in workflow as evidence that a
deployed system has been assessed.

The repository's full validation profile runs the checks listed in
[the validation manifest](../../.agents/validation.json), including dependency
audit. Run `npm run validate -- full` on the proposed tree before an authorized
commit or PR. Use [the Sonar guidance](../sonarqube.md) to verify the actual
scanner, provider quality gate and complete applicable issue report before
requesting CodeRabbit; a successful scanner alone does not establish a passing
quality gate. Verify current CI and protection status rather than assuming it
from workflow files.

The [DAST workflow](../../.github/workflows/dast.yml) validates its initial
target against staging environment settings and stops before running a scanner.
Active scans can send mutating requests. They require explicit target
authorization and verified egress that confines requests and redirects to the
authorized staging origin. See [staging](../deployment.md#protected-manual-api-checks)
for prerequisites. Use synthetic credentials and data for local tests. Production
deployment and third-party security review require separate evidence.

The following is a proposed review practice, not an established release policy:
review trust-boundary changes against the threat model and auth/session changes
against the checklist, and arrange qualified human review before production launch.
Triage findings by exploitability, exposure and release impact; assign owner and
deadline. Under the proposal, critical/actively exploited issues block deployment;
high issues require remediation or an explicit time-limited owner exception with
compensating controls. Adoption and exception authority require owner approval.
This proposed deployment triage does not waive required CI or the Sonar/CodeRabbit
preflight.
