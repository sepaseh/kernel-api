import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const botLogin = "coderabbitai[bot]";
const ciAppId = 15368;
const sonarAppId = 12526;
const pageSize = 100;
const maximumPages = 100;
const validSha = (value) =>
  typeof value === "string" && /^[a-f\d]{40}$/i.test(value);
const validId = (value) => Number.isSafeInteger(value) && value > 0;
const validName = (value) =>
  typeof value === "string" && value.trim() === value && value.length > 0;

const validatePolicy = (policy) => {
  if (
    !validId(policy?.codeRabbitUserId) ||
    !validName(policy?.sonarCheckName) ||
    !Array.isArray(policy?.requiredCiContexts) ||
    policy.requiredCiContexts.length === 0 ||
    !policy.requiredCiContexts.every(validName) ||
    new Set(policy.requiredCiContexts).size !==
      policy.requiredCiContexts.length ||
    policy.requiredCiContexts.includes(policy.sonarCheckName)
  )
    throw new Error(
      "An exact bot ID, Sonar check name and CI contexts are required.",
    );
};

const uniqueEntries = (entries, label) => {
  if (!Array.isArray(entries))
    throw new Error(`GitHub returned an invalid ${label} list.`);

  const ids = new Set();
  for (const entry of entries) {
    if (!validId(entry?.id) || ids.has(entry.id))
      throw new Error(`GitHub returned missing or duplicate ${label} IDs.`);

    ids.add(entry.id);
  }
};

const latestBotReview = (reviews, userId) => {
  uniqueEntries(reviews, "review");
  for (const review of reviews) {
    if (
      !validId(review.user?.id) ||
      !validName(review.user?.login) ||
      !validName(review.user?.type) ||
      !validSha(review.commit_id) ||
      ![
        "APPROVED",
        "CHANGES_REQUESTED",
        "COMMENTED",
        "DISMISSED",
        "PENDING",
      ].includes(review.state) ||
      (review.state !== "PENDING" &&
        (typeof review.submitted_at !== "string" ||
          !Number.isFinite(Date.parse(review.submitted_at))))
    )
      throw new Error("GitHub returned incomplete review metadata.");
  }

  const matching = reviews.filter(
    (review) => review.user.id === userId || review.user.login === botLogin,
  );
  if (
    matching.some(
      (review) =>
        review.user.id !== userId ||
        review.user.login !== botLogin ||
        review.user.type !== "Bot",
    )
  )
    throw new Error(
      "GitHub returned conflicting CodeRabbit identity metadata.",
    );

  const pending = matching.find((review) => review.state === "PENDING");
  if (pending) return pending;

  return matching.toSorted(
    (left, right) =>
      Date.parse(right.submitted_at) - Date.parse(left.submitted_at) ||
      right.id - left.id,
  )[0];
};

const latestCheck = (checks, name, appId) => {
  const matching = checks.filter(
    (check) => check.name === name && check.app?.id === appId,
  );
  // A queued rerun has no start time; its newer run ID must supersede old success.
  const latest = matching.toSorted((left, right) => right.id - left.id)[0];
  return {
    appId,
    conclusion: latest?.conclusion ?? null,
    id: latest?.id ?? null,
    name,
    passed: latest?.status === "completed" && latest.conclusion === "success",
    status: latest?.status ?? "missing",
  };
};

const validateChecks = (checks, headSha) => {
  uniqueEntries(checks, "check run");
  for (const check of checks) {
    if (
      !validId(check.app?.id) ||
      !validName(check.name) ||
      check.head_sha !== headSha ||
      ![
        "queued",
        "in_progress",
        "completed",
        "waiting",
        "requested",
        "pending",
      ].includes(check.status) ||
      (check.status === "completed" && typeof check.conclusion !== "string")
    )
      throw new Error(
        "GitHub returned incomplete or mismatched check-run metadata.",
      );
  }
};

export const evaluateReviewEvidence = ({
  checks,
  headSha,
  policy,
  reviews,
  threads,
}) => {
  validatePolicy(policy);
  if (!validSha(headSha))
    throw new Error("An exact current head SHA is required.");

  validateChecks(checks, headSha);
  if (!Array.isArray(threads))
    throw new Error("GitHub returned an invalid review-thread list.");

  const threadIds = new Set();
  for (const thread of threads) {
    if (
      !validName(thread?.id) ||
      threadIds.has(thread.id) ||
      typeof thread.isResolved !== "boolean" ||
      typeof thread.isOutdated !== "boolean"
    )
      throw new Error(
        "GitHub returned incomplete or duplicate review threads.",
      );

    threadIds.add(thread.id);
  }

  const review = latestBotReview(reviews, policy.codeRabbitUserId);
  const codeRabbit = {
    commitSha: review?.commit_id ?? null,
    id: review?.id ?? null,
    passed: review?.state === "APPROVED" && review.commit_id === headSha,
    state: review?.state ?? "missing",
    userId: policy.codeRabbitUserId,
  };
  const sonar = latestCheck(checks, policy.sonarCheckName, sonarAppId);
  const ci = policy.requiredCiContexts.map((name) =>
    latestCheck(checks, name, ciAppId),
  );
  const unresolvedThreads = threads
    .filter((thread) => !thread.isResolved)
    .map((thread) => thread.id);
  const reasons = [];
  if (!codeRabbit.passed)
    reasons.push("CodeRabbit has not approved the current head.");
  if (!sonar.passed)
    reasons.push("The current SonarCloud quality gate has not passed.");
  if (ci.some((check) => !check.passed))
    reasons.push("Required current-head CI checks have not passed.");
  if (unresolvedThreads.length > 0)
    reasons.push("Review threads remain unresolved.");

  // An evidence snapshot is not a published check or authorization to merge.
  return {
    ci,
    codeRabbit,
    evidenceSnapshotOnly: true,
    headSha,
    passed: reasons.length === 0,
    reasons,
    sonar,
    unresolvedThreads,
  };
};

const httpsUrl = (value) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "GitHub evidence endpoints must use HTTPS without credentials or query parameters.",
    );

  return url;
};

const pullMetadata = (value, repository, pullNumber, baseBranch) => {
  if (
    value?.number !== pullNumber ||
    value.state !== "open" ||
    value.draft !== false ||
    !validSha(value.head?.sha) ||
    !validSha(value.base?.sha) ||
    value.base?.ref !== baseBranch ||
    value.base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase()
  )
    throw new Error(
      "GitHub returned incomplete, closed, draft or unexpected PR metadata.",
    );

  return {
    baseBranch: value.base.ref,
    baseSha: value.base.sha,
    headSha: value.head.sha,
  };
};

const nextPageLink = (header) => {
  if (header === null) return undefined;

  let next;
  for (const segment of header.split(",")) {
    const match = /^<([^<>]+)>;\s*rel="(next|prev|first|last)"$/.exec(
      segment.trim(),
    );
    if (!match)
      throw new Error("GitHub returned malformed evidence pagination.");
    if (match[2] !== "next") continue;
    if (next) throw new Error("GitHub returned ambiguous evidence pagination.");

    next = match[1];
  }
  return next;
};

const assertPageUrl = (url, endpoint, pageNumber) => {
  const expected = new URL(endpoint);
  expected.searchParams.set("page", String(pageNumber));
  const actualParameters = [...url.searchParams].toSorted();
  const expectedParameters = [...expected.searchParams].toSorted();
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    JSON.stringify(actualParameters) !== JSON.stringify(expectedParameters)
  )
    throw new Error(
      "GitHub returned unsafe or incomplete evidence pagination.",
    );
};

const readRestPages = async (query, endpoint, property) => {
  const entries = [];
  let total;
  let pageNumber = 1;
  let url = new URL(endpoint);
  url.searchParams.set("page", "1");
  while (url) {
    if (pageNumber > maximumPages)
      throw new Error("GitHub evidence pagination exceeded its safety limit.");

    assertPageUrl(url, endpoint, pageNumber);
    // The next URL and total belong to the preceding response; fetch pages sequentially.
    const page = await query(url);
    const items = property ? page.data?.[property] : page.data;
    if (!Array.isArray(items) || items.length > pageSize)
      throw new Error("GitHub returned an invalid evidence page.");
    if (property) {
      if (
        !Number.isSafeInteger(page.data.total_count) ||
        page.data.total_count < 0 ||
        (total !== undefined && total !== page.data.total_count)
      )
        throw new Error(
          "GitHub returned incomplete or changing check-run counts.",
        );

      total = page.data.total_count;
    }

    entries.push(...items);
    const next = nextPageLink(page.link);
    url = next ? new URL(next, endpoint) : undefined;
    pageNumber++;
  }
  if (total !== undefined && entries.length !== total)
    throw new Error("The GitHub check-run list is incomplete.");

  return entries;
};

const threadQuery = `query ReviewEvidence($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      baseRefOid
      headRefOid
      reviews(first: 1) { totalCount }
      reviewThreads(first: 100, after: $cursor) {
        totalCount
        nodes { id isResolved isOutdated }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const readThreads = async (query, endpoint, variables, before, reviewCount) => {
  const threads = [];
  const cursors = new Set();
  let cursor = null;
  let total;
  do {
    if (cursors.size >= maximumPages)
      throw new Error(
        "GitHub review-thread pagination exceeded its safety limit.",
      );

    // GraphQL cursors depend on the preceding page and cannot be fetched in parallel.
    const page = await query(endpoint, {
      query: threadQuery,
      variables: { ...variables, cursor },
    });
    const pull = page.data?.data?.repository?.pullRequest;
    const connection = pull?.reviewThreads;
    if (
      page.data?.errors ||
      pull?.headRefOid !== before.headSha ||
      pull?.baseRefOid !== before.baseSha ||
      pull?.reviews?.totalCount !== reviewCount ||
      !Array.isArray(connection?.nodes) ||
      connection.nodes.length > pageSize ||
      !Number.isSafeInteger(connection.totalCount) ||
      connection.totalCount < 0 ||
      (total !== undefined && total !== connection.totalCount) ||
      typeof connection.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error(
        "GitHub returned incomplete, changing or failed GraphQL evidence.",
      );

    total = connection.totalCount;
    threads.push(...connection.nodes);
    const { endCursor, hasNextPage } = connection.pageInfo;
    if (hasNextPage && (!validName(endCursor) || cursors.has(endCursor)))
      throw new Error(
        "GitHub returned missing or repeated review-thread cursors.",
      );

    if (hasNextPage) cursors.add(endCursor);
    cursor = hasNextPage ? endCursor : null;
  } while (cursor);
  if (threads.length !== total)
    throw new Error("The GitHub review-thread list is incomplete.");

  return threads;
};

const createQuery = (fetchImpl, token, timeoutMs) => async (url, body) => {
  let response;
  try {
    response = await fetchImpl(url.href, {
      ...(body
        ? { body: JSON.stringify(body), method: "POST" }
        : { method: "GET" }),
      headers: {
        Accept: "application/vnd.github+json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-GitHub-Api-Version": "2026-03-10",
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("GitHub evidence request failed or timed out.");
  }
  if (!response.ok)
    throw new Error(`GitHub evidence query failed (HTTP ${response.status}).`);

  try {
    return { data: await response.json(), link: response.headers.get("link") };
  } catch {
    throw new Error("GitHub returned unreadable evidence.");
  }
};

export const inspectReviewApprovals = async ({
  apiUrl = "https://api.github.com/",
  baseBranch = "main",
  expectedHeadSha,
  fetchImpl = fetch,
  graphqlUrl = "https://api.github.com/graphql",
  policy,
  pullNumber,
  repository,
  timeoutMs = 20_000,
  token,
}) => {
  validatePolicy(policy);
  if (
    typeof repository !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    repository.split("/").some((part) => part === "." || part === "..") ||
    !validId(pullNumber) ||
    !validSha(expectedHeadSha) ||
    !validName(baseBranch) ||
    !validId(timeoutMs) ||
    timeoutMs > 120_000
  )
    throw new Error(
      "An exact repository, PR number, head SHA, base and valid timeout are required.",
    );

  const api = httpsUrl(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  const graphql = httpsUrl(graphqlUrl);
  if (api.origin !== graphql.origin)
    throw new Error("GitHub REST and GraphQL evidence must share one origin.");

  const [owner, name] = repository.split("/");
  const pullEndpoint = new URL(
    `repos/${owner}/${name}/pulls/${pullNumber}`,
    api,
  );
  const query = createQuery(fetchImpl, token, timeoutMs);
  const before = pullMetadata(
    (await query(pullEndpoint)).data,
    repository,
    pullNumber,
    baseBranch,
  );
  if (before.headSha !== expectedHeadSha)
    throw new Error("This evidence request belongs to an older PR head.");

  const [reviews, checks] = await Promise.all([
    readRestPages(
      query,
      new URL(`${pullEndpoint.href}/reviews?per_page=${pageSize}`),
    ),
    readRestPages(
      query,
      new URL(
        `repos/${owner}/${name}/commits/${before.headSha}/check-runs?filter=all&per_page=${pageSize}`,
        api,
      ),
      "check_runs",
    ),
  ]);
  const threads = await readThreads(
    query,
    graphql,
    { name, number: pullNumber, owner },
    before,
    reviews.length,
  );
  const after = pullMetadata(
    (await query(pullEndpoint)).data,
    repository,
    pullNumber,
    baseBranch,
  );
  if (before.headSha !== after.headSha || before.baseSha !== after.baseSha)
    throw new Error(
      "The PR head or base changed while approval evidence was collected; rerun.",
    );

  return {
    ...evaluateReviewEvidence({
      checks,
      headSha: after.headSha,
      policy,
      reviews,
      threads,
    }),
    ...after,
  };
};

export const readReviewInputs = (env, event = {}) => {
  const pullNumber = env.REVIEW_PULL_NUMBER
    ? Number(env.REVIEW_PULL_NUMBER)
    : event.pull_request?.number;
  const expectedHeadSha = env.REVIEW_HEAD_SHA || event.pull_request?.head?.sha;
  if (
    (event.pull_request?.number && event.pull_request.number !== pullNumber) ||
    (event.pull_request?.head?.sha &&
      event.pull_request.head.sha !== expectedHeadSha)
  )
    throw new Error("Explicit PR inputs disagree with the event.");

  let requiredCiContexts;
  try {
    requiredCiContexts = JSON.parse(env.REVIEW_REQUIRED_CI_CONTEXTS);
  } catch {
    throw new Error(
      "REVIEW_REQUIRED_CI_CONTEXTS must be a nonempty JSON array of exact check names.",
    );
  }
  const policy = {
    codeRabbitUserId: Number(env.REVIEW_CODERABBIT_USER_ID),
    requiredCiContexts,
    sonarCheckName: env.REVIEW_SONAR_CHECK_NAME,
  };
  validatePolicy(policy);

  return {
    apiUrl: env.GITHUB_API_URL,
    baseBranch: env.REVIEW_BASE_BRANCH || "main",
    expectedHeadSha,
    graphqlUrl: env.GITHUB_GRAPHQL_URL,
    policy,
    pullNumber,
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const event = process.env.GITHUB_EVENT_PATH
      ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))
      : {};
    const result = await inspectReviewApprovals(
      readReviewInputs(process.env, event),
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        evidenceSnapshotOnly: true,
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : "Approval evidence check failed.",
      }),
    );
    process.exitCode = 1;
  }
}
