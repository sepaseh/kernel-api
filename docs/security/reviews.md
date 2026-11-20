# Security review and checks

Use the [threat model](threat-model.md) for trust-boundary changes and the
[session checklist](authentication-review.md) for authentication changes. Use
the [security policy](../../SECURITY.md) to report findings privately.

## Review changes

- Trace each affected permission, input boundary and failure case to the owning
  implementation and tests. For content and files, review HTML sanitization,
  image validation, visibility and reference-protected deletion together.
- Review workflow changes for minimum token permissions, pinned actions,
  trusted checkouts, fork isolation and provider identity. See
  [branch protection](../branch-protection.md#published-phase-and-trust).
- Review findings by exploitability, exposure and release impact. Record an
  owner and resolution.

## Verify available checks

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

## Proposed deployment triage

The proposed practice adds qualified human review before launch and a deadline
for each finding. It blocks deployment for critical or actively exploited issues.
High-severity issues require remediation or an explicit, time-limited owner
exception with compensating controls. Adoption and exception authority require
owner approval. Required CI and the Sonar/CodeRabbit preflight still apply.
