import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectReviewApprovals } from "./check-review-approvals.mjs";

const apiOrigin = "https://api.github.com";
const checkName = "Review approval gate";
const tokenPermissions = {
  checks: "write",
  contents: "read",
  pull_requests: "read",
};
const validId = (value) => Number.isSafeInteger(value) && value > 0;
const validSha = (value) =>
  typeof value === "string" && /^[a-f\d]{40}$/i.test(value);

const validateInputs = ({
  appId,
  expectedBaseSha,
  expectedHeadSha,
  installationId,
  policy,
  pullNumber,
  timeoutMs,
}) => {
  if (
    !validId(appId) ||
    !validId(installationId) ||
    !validId(pullNumber) ||
    !validSha(expectedHeadSha) ||
    !validSha(expectedBaseSha) ||
    !validId(timeoutMs) ||
    timeoutMs > 120_000 ||
    policy?.schemaVersion !== 1 ||
    !validId(policy.repositoryId) ||
    typeof policy.repository !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(policy.repository) ||
    policy.repository
      .split("/")
      .some((part) => part === "." || part === "..") ||
    typeof policy.baseBranch !== "string" ||
    !policy.baseBranch.trim() ||
    !validId(policy.codeRabbitUserId) ||
    typeof policy.sonarCheckName !== "string" ||
    !policy.sonarCheckName.trim() ||
    !Array.isArray(policy.requiredCiContexts) ||
    policy.requiredCiContexts.length === 0 ||
    policy.requiredCiContexts.some(
      (name) => typeof name !== "string" || !name.trim(),
    ) ||
    new Set(policy.requiredCiContexts).size !==
      policy.requiredCiContexts.length ||
    policy.requiredCiContexts.includes(checkName) ||
    policy.requiredCiContexts.includes(policy.sonarCheckName)
  )
    throw new Error(
      "Exact App, installation, repository, PR, head/base and review policy inputs are required.",
    );
};

export const createGitHubAppJwt = ({ appId, now = Date.now(), privateKey }) => {
  if (!validId(appId) || !Number.isSafeInteger(now) || now <= 0)
    throw new Error("A valid GitHub App ID and clock are required.");

  try {
    const key = createPrivateKey(privateKey);
    if (
      key.asymmetricKeyType !== "rsa" ||
      key.asymmetricKeyDetails.modulusLength < 2048
    )
      throw new Error("Unsupported signing key.");

    const seconds = Math.floor(now / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        exp: seconds + 540,
        iat: seconds - 60,
        iss: String(appId),
      }),
    ).toString("base64url");
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
  } catch {
    throw new Error(
      "GitHub App signing requires a valid RSA private key of at least 2048 bits.",
    );
  }
};

const checkedFetch =
  (fetchImpl) =>
  async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin !== apiOrigin || url.username || url.password || url.hash)
      throw new Error(
        "Publisher requests must remain on the fixed GitHub HTTPS API origin.",
      );

    try {
      const response = await fetchImpl(url.href, {
        ...options,
        redirect: "error",
      });
      if (response.redirected || (response.url && response.url !== url.href))
        throw new Error("Unexpected response origin.");

      return response;
    } catch {
      throw new Error("GitHub publisher request failed or was redirected.");
    }
  };

const requestJson =
  (fetchImpl, authorization, timeoutMs) =>
  async (endpoint, body, method = "GET") => {
    const response = await fetchImpl(`${apiOrigin}${endpoint}`, {
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${authorization}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-GitHub-Api-Version": "2026-03-10",
      },
      method,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      throw new Error(
        `GitHub publisher request failed (HTTP ${response.status}).`,
      );

    try {
      return {
        data: await response.json(),
        link: response.headers.get("link"),
      };
    } catch {
      throw new Error("GitHub returned unreadable publisher metadata.");
    }
  };

const validateToken = (value, now) => {
  if (
    typeof value?.token !== "string" ||
    !value.token ||
    !Number.isFinite(Date.parse(value.expires_at)) ||
    Date.parse(value.expires_at) <= now + 60_000 ||
    !value.permissions ||
    tokenPermissions.checks !== value.permissions.checks ||
    tokenPermissions.contents !== value.permissions.contents ||
    tokenPermissions.pull_requests !== value.permissions.pull_requests ||
    Object.entries(value.permissions).some(([name, permission]) =>
      name === "metadata"
        ? permission !== "read"
        : tokenPermissions[name] !== permission,
    )
  )
    throw new Error(
      "GitHub returned an expired, incomplete or overprivileged installation token.",
    );
};

const installationClient = async ({
  appId,
  fetchImpl,
  installationId,
  jwt,
  now,
  policy,
  timeoutMs,
}) => {
  const appQuery = requestJson(fetchImpl, jwt, timeoutMs);
  const { data: app } = await appQuery("/app");
  if (app?.id !== appId)
    throw new Error(
      "The authenticated GitHub App identity does not match policy.",
    );

  const { data: installation } = await appQuery(
    `/repos/${policy.repository}/installation`,
  );
  const [owner] = policy.repository.split("/");
  if (
    installation?.id !== installationId ||
    installation.app_id !== appId ||
    installation.account?.login?.toLowerCase() !== owner.toLowerCase() ||
    installation.suspended_at
  )
    throw new Error(
      "The GitHub installation does not match the expected App and account.",
    );

  const { data: access } = await appQuery(
    `/app/installations/${installationId}/access_tokens`,
    {
      permissions: tokenPermissions,
      repository_ids: [policy.repositoryId],
    },
    "POST",
  );
  validateToken(access, now());

  const query = requestJson(fetchImpl, access.token, timeoutMs);
  const { data: scope, link } = await query(
    "/installation/repositories?per_page=100",
  );
  if (
    link ||
    scope?.total_count !== 1 ||
    !Array.isArray(scope.repositories) ||
    scope.repositories.length !== 1 ||
    scope.repositories[0]?.id !== policy.repositoryId ||
    scope.repositories[0]?.full_name?.toLowerCase() !==
      policy.repository.toLowerCase()
  )
    throw new Error(
      "The installation token must access exactly the policy repository.",
    );

  return { query, token: access.token };
};

const validateCheck = (
  value,
  { appId, checkRunId, expectedHeadSha, status, conclusion = null },
) => {
  if (
    !validId(value?.id) ||
    (checkRunId !== undefined && value.id !== checkRunId) ||
    value.name !== checkName ||
    value.app?.id !== appId ||
    value.head_sha !== expectedHeadSha ||
    value.status !== status ||
    value.conclusion !== conclusion
  )
    throw new Error(
      "GitHub returned a check run with unexpected identity, commit or state.",
    );
};

const passingEvidence = (
  result,
  { expectedBaseSha, expectedHeadSha, policy },
) => {
  const passedCheck = (value, appId, name) =>
    validId(value?.id) &&
    value.appId === appId &&
    value.name === name &&
    value.passed === true &&
    value.status === "completed" &&
    value.conclusion === "success";
  if (
    result?.evidenceSnapshotOnly !== true ||
    result.passed !== true ||
    result.headSha !== expectedHeadSha ||
    result.baseSha !== expectedBaseSha ||
    result.baseBranch !== policy.baseBranch ||
    !Array.isArray(result.reasons) ||
    result.reasons.length !== 0 ||
    !Array.isArray(result.unresolvedThreads) ||
    result.unresolvedThreads.length !== 0 ||
    result.codeRabbit?.passed !== true ||
    result.codeRabbit.state !== "APPROVED" ||
    !validId(result.codeRabbit.id) ||
    result.codeRabbit.userId !== policy.codeRabbitUserId ||
    result.codeRabbit.commitSha !== expectedHeadSha ||
    !passedCheck(result.sonar, 12526, policy.sonarCheckName) ||
    !Array.isArray(result.ci) ||
    result.ci.length !== policy.requiredCiContexts.length ||
    policy.requiredCiContexts.some(
      (name) =>
        result.ci.filter((check) => passedCheck(check, 15368, name)).length !==
        1,
    )
  )
    throw new Error(
      "Current-head CodeRabbit, Sonar, CI and resolved-thread evidence did not all pass.",
    );
};

const validateCurrentPull = (
  value,
  { expectedBaseSha, expectedHeadSha, policy, pullNumber },
) => {
  if (
    value?.number !== pullNumber ||
    value.state !== "open" ||
    value.draft !== false ||
    value.head?.sha !== expectedHeadSha ||
    value.base?.sha !== expectedBaseSha ||
    value.base?.ref !== policy.baseBranch ||
    value.base?.repo?.id !== policy.repositoryId ||
    value.base?.repo?.full_name?.toLowerCase() !==
      policy.repository.toLowerCase()
  )
    throw new Error(
      "The PR head/base, target repository or merge eligibility changed.",
    );
};

export const publishReviewApproval = async ({
  appId,
  expectedBaseSha,
  expectedHeadSha,
  fetchImpl = fetch,
  inspect = inspectReviewApprovals,
  installationId,
  loadPrivateKey,
  now = Date.now,
  policy,
  pullNumber,
  timeoutMs = 20_000,
}) => {
  const inputs = {
    appId,
    expectedBaseSha,
    expectedHeadSha,
    installationId,
    policy,
    pullNumber,
    timeoutMs,
  };
  validateInputs(inputs);
  if (typeof loadPrivateKey !== "function")
    throw new Error("An explicit runtime private-key loader is required.");

  const jwt = createGitHubAppJwt({
    appId,
    now: now(),
    privateKey: await loadPrivateKey(),
  });
  const safeFetch = checkedFetch(fetchImpl);
  const { query, token } = await installationClient({
    appId,
    fetchImpl: safeFetch,
    installationId,
    jwt,
    now,
    policy,
    timeoutMs,
  });
  const endpoint = `/repos/${policy.repository}/check-runs`;
  const { data: pending } = await query(
    endpoint,
    {
      head_sha: expectedHeadSha,
      name: checkName,
      output: {
        summary:
          "Independent approval evidence is being verified; this is not permission to merge.",
        title: "Approval verification in progress",
      },
      started_at: new Date(now()).toISOString(),
      status: "in_progress",
    },
    "POST",
  );
  validateCheck(pending, { ...inputs, status: "in_progress" });
  const checkRunId = pending.id;
  const finish = async (passed) => {
    const conclusion = passed ? "success" : "failure";
    const { data: completed } = await query(
      `${endpoint}/${checkRunId}`,
      {
        completed_at: new Date(now()).toISOString(),
        conclusion,
        output: {
          summary: passed
            ? "CodeRabbit approved this exact head, Sonar and required CI passed, and review threads are resolved. Head and base were stable during verification."
            : "Approval evidence was missing, failed, changed or could not be verified. Merge remains blocked; retry the trusted publisher after resolving the cause.",
          title: passed
            ? "Independent approval requirements passed"
            : "Independent approval requirements were not verified",
        },
        status: "completed",
      },
      "PATCH",
    );
    validateCheck(completed, {
      ...inputs,
      checkRunId,
      conclusion,
      status: "completed",
    });
  };

  try {
    const evidence = await inspect({
      baseBranch: policy.baseBranch,
      expectedHeadSha,
      fetchImpl: safeFetch,
      policy,
      pullNumber,
      repository: policy.repository,
      timeoutMs,
      token,
    });
    passingEvidence(evidence, inputs);
    const { data: beforePublication } = await query(
      `/repos/${policy.repository}/pulls/${pullNumber}`,
    );
    validateCurrentPull(beforePublication, inputs);
    await finish(true);
    const { data: afterPublication } = await query(
      `/repos/${policy.repository}/pulls/${pullNumber}`,
    );
    validateCurrentPull(afterPublication, inputs);
    return {
      baseSha: expectedBaseSha,
      checkRunId,
      headSha: expectedHeadSha,
      passed: true,
      published: true,
    };
  } catch {
    try {
      await finish(false);
    } catch {
      throw new Error(
        "Approval publication failed; a successful final gate was not confirmed.",
      );
    }
    return {
      baseSha: expectedBaseSha,
      checkRunId,
      headSha: expectedHeadSha,
      passed: false,
      published: true,
    };
  }
};

export const readPublisherInputs = (env, policy) => {
  if (env.GITHUB_ACTIONS === "true" || env.GITHUB_EVENT_NAME)
    throw new Error("Run the trusted App publisher outside pull-request CI.");

  const inputs = {
    appId: Number(env.REVIEW_APP_ID),
    expectedBaseSha: env.REVIEW_BASE_SHA,
    expectedHeadSha: env.REVIEW_HEAD_SHA,
    installationId: Number(env.REVIEW_APP_INSTALLATION_ID),
    policy,
    pullNumber: Number(env.REVIEW_PULL_NUMBER),
    timeoutMs: 20_000,
  };
  validateInputs(inputs);
  if (
    typeof env.REVIEW_APP_PRIVATE_KEY_PATH !== "string" ||
    !path.isAbsolute(env.REVIEW_APP_PRIVATE_KEY_PATH)
  )
    throw new Error("An absolute REVIEW_APP_PRIVATE_KEY_PATH is required.");

  return {
    ...inputs,
    loadPrivateKey: async () => {
      try {
        return await readFile(env.REVIEW_APP_PRIVATE_KEY_PATH, "utf8");
      } catch {
        throw new Error(
          "The runtime GitHub App signing key could not be loaded.",
        );
      }
    },
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (
      !process.env.REVIEW_PUBLISHER_POLICY_PATH ||
      !path.isAbsolute(process.env.REVIEW_PUBLISHER_POLICY_PATH)
    )
      throw new Error(
        "An absolute trusted REVIEW_PUBLISHER_POLICY_PATH is required.",
      );

    const policy = JSON.parse(
      await readFile(process.env.REVIEW_PUBLISHER_POLICY_PATH, "utf8"),
    );
    const result = await publishReviewApproval(
      readPublisherInputs(process.env, policy),
    );
    console.log(JSON.stringify(result));
    if (!result.passed) process.exitCode = 1;
  } catch {
    console.error(
      JSON.stringify({
        passed: false,
        published: false,
        error:
          "Trusted review approval publication failed; inspect operator configuration and provider evidence.",
      }),
    );
    process.exitCode = 1;
  }
}
