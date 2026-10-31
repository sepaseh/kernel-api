# Security review and checks

[English](reviews.md) · [فارسی](reviews.fa.md)

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

The [DAST workflow](../../.github/workflows/dast.yml) is a manual staging-only
template that can send mutating scan traffic. It reads target settings from the
staging environment and rejects the configured production host; environment
protections must be configured and verified separately. Do not dispatch it
without explicit authorization for the target. See [staging](../deployment.md#protected-manual-api-checks)
for prerequisites. Use synthetic credentials and data for local tests; do not
read real credentials or use production data. Local and synthetic tests do not
prove that a production deployment or third-party security review has occurred.

The following is a proposed review practice, not an established release policy:
review trust-boundary changes against the threat model and auth/session changes
against the checklist, and arrange qualified human review before production launch.
Triage findings by exploitability, exposure and release impact; assign owner and
deadline. Under the proposal, critical/actively exploited issues block deployment;
high issues require remediation or an explicit time-limited owner exception with
compensating controls. Adoption and exception authority require owner approval.
