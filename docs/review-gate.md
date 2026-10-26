# Review approval gate operations

[English](review-gate.md) · [فارسی](review-gate.fa.md)

Merging requires successful CI, CodeRabbit approval of the current PR head, a
passing SonarCloud provider check and resolved review conversations. The
**Review approval gate** combines this evidence; native branch protection and
the individual CI/Sonar checks remain required independently. See
[branch protection](branch-protection.md), [bootstrap](bootstrap.md) and
[Sonar setup](sonarqube.md).

## Setup checkpoint

On 26 October 2026, native protection was enabled for all three repositories.
The API PR was blocked by the missing **Review approval gate**. The dedicated
publisher App had not been created, installed or connected. Source files and
local tests do not establish a working hosted integration. Keep merging blocked
until the actual App publishes the required check and every other condition passes.

An empty default branch cannot authorize its own first gate implementation.
Deploy independently reviewed publisher code outside the PR checkout. Do not
temporarily remove protection or give a PR-head workflow the App signing key.

## Required evidence

The trusted [policy](../.github/review-policy.json) identifies the repository and
its numeric ID, base branch, CodeRabbit user ID and exact CI/Sonar check names.
For `sepaseh/kernel-api`, the repository ID is `1431919186`.

| Evidence      | Required result                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PR            | Open, ready for review, expected repository/base branch and unchanged exact head/base SHAs throughout inspection/publication. |
| CodeRabbit    | Latest review from `coderabbitai[bot]`, user ID `136622811`, type `Bot`, is `APPROVED` on the exact current head.             |
| Sonar         | Latest `SonarCloud Code Analysis` check from SonarCloud App `12526` is completed with `success` on that head.                 |
| CI            | Every context in the trusted policy is completed with `success` from GitHub Actions App `15368` on that head.                 |
| Conversations | Every review thread is resolved, including outdated threads.                                                                  |

Missing, pending, failed, cancelled, skipped or rate-limited required evidence
never passes. A successful generic `CodeRabbit` progress check is insufficient;
an approval count can be satisfied by someone other than CodeRabbit. Scanner
execution and the Sonar provider quality gate are separate evidence.

## Register and install the publisher App

Use a dedicated App for publishing this check, separate from CodeRabbit and
SonarCloud. Follow GitHub's [registration instructions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).

1. Open [New GitHub App](https://github.com/settings/apps/new) under the owning
   `sepaseh` account. Suggested name: `sepaseh-kernel-review-gate`, if available.
   Use the owning account or public project URL as its homepage.
2. This publisher uses installation authentication, so leave user OAuth/callback
   and setup options unused. Clear **Active** under webhooks; the current
   one-shot operator/poller does not receive webhook events.
3. Set only these repository permissions: **Checks: Read and write**,
   **Contents: Read-only**, **Pull requests: Read-only**. GitHub includes
   **Metadata: Read-only** automatically. Leave unrelated permissions unset;
   neither Administration nor Workflows write access is needed.
4. Select **Only on this account**, create the App and record its numeric App ID.
5. Open **Install App**, install on the owning account and choose **Only select
   repositories**: `kernel-api`, `kernel-admin` and `kernel-website`. Record the
   installation ID from the installation settings URL. Each execution further
   limits its installation token to the single repository in its trusted policy.
6. Under the App's **Credentials → Key pairs**, generate/download a private key.
   Store it in a protected private directory outside **every** repository and
   PR checkout. Never put its contents, JWTs or installation tokens in chat,
   source, commits or logs. Share only the App ID, installation ID and absolute
   key-file path with the authorized operator.

Use GitHub's [permission guidance](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
[installation instructions](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)
and [private-key handling](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
when completing or rotating this setup.

## Run from a trusted deployment

Deploy reviewed copies of [the publisher](../scripts/publish-review-approval.mjs),
its sibling [evidence checker](../scripts/check-review-approvals.mjs) and the policy
outside the PR checkout. The operator must verify the deployed code and policy;
an absolute path alone does not make a file trusted. Never load policy, scripts
or executable configuration from the PR head. The App's write credential must
remain inaccessible to PR code.

Set these variables only in the trusted external process:

| Variable                       | Value                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `REVIEW_APP_ID`                | Numeric ID of the dedicated publisher App.                                        |
| `REVIEW_APP_INSTALLATION_ID`   | Numeric installation ID for the owning account.                                   |
| `REVIEW_APP_PRIVATE_KEY_PATH`  | Absolute path to the private key outside all repositories.                        |
| `REVIEW_PUBLISHER_POLICY_PATH` | Absolute path to the independently reviewed copy of `.github/review-policy.json`. |
| `REVIEW_PULL_NUMBER`           | Target PR number.                                                                 |
| `REVIEW_HEAD_SHA`              | Exact current 40-character PR-head SHA.                                           |
| `REVIEW_BASE_SHA`              | Exact current 40-character PR-base SHA.                                           |

Run Node with the deployed publisher's **absolute** path:

```sh
node /absolute/trusted/deployment/scripts/publish-review-approval.mjs
```

Use the equivalent absolute path on Windows. This example is a deployment path,
not a command to run inside the PR checkout. The CLI rejects GitHub Actions/event
execution. It authenticates the App/installation, checks the repository scope and
publishes **Review approval gate** on the specified head. Output contains only
result metadata: `baseSha`, `checkRunId`, `headSha`, `passed` and `published`;
failures use a sanitized message and a nonzero exit status. Do not add credential
logging to diagnose a failure.

Bind the required **Review approval gate** check to this dedicated App's ID in
native protection. A same-named check from a different App must not satisfy it.
Retain protection for administrators, stale-approval dismissal, resolved
conversations and the separately required CI/Sonar checks. Verify the real check's
App identity, commit and conclusion before calling the integration operational.

## Recheck and recovery

This CLI publishes a one-time evidence snapshot. It does not install a daemon or
automatically react to new commits, reviews, thread changes or provider reruns.
Use an explicitly operated external runner or a trusted polling/event service to
rerun it after those changes. A new push invalidates prior-head approval and
evidence; a base change also requires fresh inspection. Confirm the current
head/base and native requirements again immediately before merging.

If CodeRabbit skips review, request one review through the authorized PR cycle.
If quota prevents review, wait for the provider allowance and re-review the
current head. Never reuse an older approval, report a skipped review as success
or weaken protection to unblock it. Missing App access, publisher failure or
incomplete provider responses leave the required gate unsatisfied.

GitHub does not provide an atomic transaction covering every review, check,
conversation and merge. The publisher's repeated head/base checks reduce stale
snapshots; they do not prove an atomic or adversarial review-identity guarantee.
Keep credential isolation, trusted deployment, native checks and final operator
verification in place. Record the actual repository, PR, head/base, check-run ID,
provider results and remaining blockers without recording credentials.
