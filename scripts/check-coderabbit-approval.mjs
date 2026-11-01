import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkName = "CodeRabbit approval";
const bot = { id: 136622811, login: "coderabbitai[bot]", type: "Bot" };
const app = { id: 347564, slug: "coderabbitai" };
const validSha = (value) =>
  typeof value === "string" && /^[a-f\d]{40}$/.test(value);
const validNodeId = (value) => typeof value === "string" && value.length > 0;
const updateCheckRun = `
  mutation CompleteCodeRabbitApproval($input: UpdateCheckRunInput!) {
    updateCheckRun(input: $input) {
      checkRun {
        id
        name
        status
        conclusion
        repository { id nameWithOwner }
        checkSuite { commit { oid } }
      }
    }
  }
`;
class EvidenceError extends Error {}
const requireEvidence = (condition, message) => {
  if (!condition) throw new EvidenceError(message);
};

const nextPageUrl = (link, initial) => {
  let next;
  const relations = new Set();
  for (const segment of link?.split(",") ?? []) {
    const match = /^<([^<>]+)>;\s*rel="(next|prev|first|last)"$/.exec(
      segment.trim(),
    );
    requireEvidence(
      match && !relations.has(match[2]),
      "GitHub returned invalid pagination links.",
    );
    relations.add(match[2]);
    if (match[2] === "next") next = new URL(match[1], initial);
  }
  return next;
};

const githubClient = ({ fetchImpl = fetch, repository, token }) => {
  requireEvidence(
    typeof repository === "string" &&
      /^[\w.-]+\/[\w.-]+$/.test(repository) &&
      !repository.split("/").some((part) => part === "." || part === ".."),
    "An exact GitHub repository is required.",
  );
  const root = `https://api.github.com/repos/${repository}/`;
  const headers = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2026-03-10",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const request = async (endpoint, { body, method = "GET" } = {}) => {
    const url = new URL(endpoint, root);
    requireEvidence(
      url.href.startsWith(root) && !url.username && !url.password && !url.hash,
      "GitHub returned an unsafe API URL.",
    );
    const response = await fetchImpl(url.href, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: "error",
    });
    requireEvidence(
      response.ok,
      `GitHub evidence query failed (HTTP ${response.status}).`,
    );
    return { data: await response.json(), link: response.headers.get("link") };
  };
  const completeCheck = async (input, headSha) => {
    const response = await fetchImpl("https://api.github.com/graphql", {
      body: JSON.stringify({ query: updateCheckRun, variables: { input } }),
      headers,
      method: "POST",
      redirect: "error",
    });
    requireEvidence(
      response.ok,
      `GitHub approval update failed (HTTP ${response.status}).`,
    );
    const payload = await response.json();
    requireEvidence(
      payload?.errors === undefined ||
        (Array.isArray(payload.errors) && payload.errors.length === 0),
      "GitHub did not complete the approval check.",
    );
    const updated = payload?.data?.updateCheckRun?.checkRun;
    requireEvidence(
      updated?.id === input.checkRunId &&
        updated.name === checkName &&
        updated.repository?.id === input.repositoryId &&
        updated.repository.nameWithOwner === repository &&
        updated.checkSuite?.commit?.oid === headSha &&
        updated.status === "COMPLETED" &&
        updated.conclusion === input.conclusion,
      "GitHub returned incomplete or mismatched approval check evidence.",
    );
  };
  const list = async (endpoint, field) => {
    const initial = new URL(endpoint, root);
    const entries = [];
    const ids = new Set();
    const visited = new Set();
    let expectedCount;
    const readPage = async (next) => {
      requireEvidence(
        next.origin === initial.origin &&
          next.pathname === initial.pathname &&
          !next.username &&
          !next.password &&
          !next.hash &&
          next.searchParams.get("per_page") === "100" &&
          next.searchParams.get("filter") ===
            initial.searchParams.get("filter") &&
          !visited.has(next.href) &&
          visited.size < 100,
        "GitHub returned unsafe or incomplete pagination.",
      );
      visited.add(next.href);
      const page = await request(next.href);
      const values = field ? page.data?.[field] : page.data;
      requireEvidence(
        Array.isArray(values),
        "GitHub returned an invalid evidence page.",
      );
      if (field) {
        requireEvidence(
          Number.isSafeInteger(page.data.total_count) &&
            page.data.total_count >= 0 &&
            (expectedCount === undefined ||
              expectedCount === page.data.total_count),
          "GitHub returned incomplete or changing evidence counts.",
        );
        expectedCount = page.data.total_count;
      }
      for (const value of values) {
        requireEvidence(
          Number.isSafeInteger(value?.id) && value.id > 0 && !ids.has(value.id),
          "GitHub returned duplicate or incomplete evidence.",
        );
        ids.add(value.id);
        entries.push(value);
      }
      const nextUrl = nextPageUrl(page.link, initial);
      // The preceding page supplies each next URL, so pagination stays sequential.
      if (nextUrl) return readPage(nextUrl);
    };
    await readPage(initial);
    requireEvidence(
      expectedCount === undefined || expectedCount === entries.length,
      "GitHub returned incomplete evidence pages.",
    );
    return entries;
  };
  return { completeCheck, list, request };
};

const pullMetadata = (value) => {
  requireEvidence(
    value?.state === "open" &&
      validSha(value.head?.sha) &&
      validSha(value.base?.sha),
    "An open pull request with complete head and base metadata is required.",
  );
  return { baseSha: value.base.sha, headSha: value.head.sha };
};

export const inspectCodeRabbitApproval = async (options) => {
  const { expectedHeadSha, pullNumber } = options;
  requireEvidence(
    Number.isSafeInteger(pullNumber) &&
      pullNumber > 0 &&
      validSha(expectedHeadSha),
    "An exact pull request number and expected head are required.",
  );
  const { list, request } = githubClient(options);
  const endpoint = `pulls/${pullNumber}`;
  const before = pullMetadata((await request(endpoint)).data);
  requireEvidence(
    before.headSha === expectedHeadSha,
    "This run belongs to a stale PR head.",
  );
  const evidence = async () => {
    const checks = await list(
      `commits/${expectedHeadSha}/check-runs?per_page=100&filter=all`,
      "check_runs",
    );
    const reviews = await list(`${endpoint}/reviews?per_page=100`);
    return {
      checks: checks
        .filter((item) => item.name === "CodeRabbit" && item.app?.id === app.id)
        .map((item) => ({
          app: item.app,
          conclusion: item.conclusion,
          head_sha: item.head_sha,
          id: item.id,
          name: item.name,
          output: { title: item.output?.title },
          status: item.status,
        })),
      reviews: reviews
        .filter((item) => item.user?.id === bot.id)
        .map((item) => ({
          commit_id: item.commit_id,
          id: item.id,
          state: item.state,
          user: item.user,
        })),
    };
  };
  const first = await evidence();
  const current = await evidence();
  const after = pullMetadata((await request(endpoint)).data);
  requireEvidence(
    JSON.stringify(before) === JSON.stringify(after) &&
      JSON.stringify(first) === JSON.stringify(current),
    "The PR or its review evidence changed during verification; rerun the check.",
  );
  const review = current.reviews.findLast((item) => item.user?.id === bot.id);
  requireEvidence(
    review &&
      Object.entries(bot).every(([key, value]) => review.user[key] === value) &&
      review.state === "APPROVED" &&
      review.commit_id === expectedHeadSha,
    "The latest CodeRabbit review must approve the current PR head; missing, dismissed or stale approval blocks merging.",
  );
  const check = current.checks
    .filter((item) => item.name === "CodeRabbit" && item.app?.id === app.id)
    .sort((left, right) => right.id - left.id)[0];
  requireEvidence(
    check?.app.slug === app.slug &&
      check.head_sha === expectedHeadSha &&
      check.status === "completed" &&
      check.conclusion === "success" &&
      check.output?.title === "Finished",
    "The latest native CodeRabbit check must finish successfully for this head; skipped, neutral or missing review evidence blocks merging.",
  );
  return {
    checkRunId: check.id,
    headSha: expectedHeadSha,
    pullNumber,
    reviewId: review.id,
  };
};

const verifyPull = async (options, pull, client) => {
  const { headSha } = pullMetadata(pull);
  const { publish = false } = options;
  requireEvidence(
    Number.isSafeInteger(pull.number) && pull.number > 0,
    "A pull request number is required.",
  );
  const target = {
    ...options,
    expectedHeadSha: headSha,
    pullNumber: pull.number,
  };
  let check;
  if (publish) {
    check = (
      await client.request("check-runs", {
        body: {
          head_sha: headSha,
          name: checkName,
          status: "in_progress",
        },
        method: "POST",
      })
    ).data;
    requireEvidence(
      Number.isSafeInteger(check?.id) &&
        check.id > 0 &&
        validNodeId(check.node_id) &&
        check.head_sha === headSha &&
        check.name === checkName &&
        check.status === "in_progress",
      "GitHub did not create the approval check.",
    );
  }
  let result;
  try {
    result = { ...(await inspectCodeRabbitApproval(target)), approved: true };
  } catch (error) {
    result = {
      approved: false,
      headSha,
      message:
        error instanceof EvidenceError
          ? error.message
          : "GitHub review evidence could not be read.",
      pullNumber: pull.number,
    };
  }
  if (publish)
    await client.completeCheck(
      {
        checkRunId: check.node_id,
        completedAt: new Date().toISOString(),
        conclusion: result.approved ? "SUCCESS" : "FAILURE",
        output: {
          summary: result.approved
            ? `PR #${result.pullNumber} at ${headSha}: bot review ${result.reviewId}, native check ${result.checkRunId}.`
            : result.message,
          title: result.approved
            ? "Current-head CodeRabbit approval verified"
            : "CodeRabbit approval is required",
        },
        repositoryId: options.event.repository.node_id,
        status: "COMPLETED",
      },
      headSha,
    );
  return result;
};

export const runCodeRabbitApproval = async (options) => {
  const {
    event,
    eventName,
    publish = false,
    repository,
    token,
    workflowRef,
    workflowSha,
  } = options;
  const allowedEvents = new Set([
    "pull_request_target",
    "workflow_run",
    "check_run",
    "workflow_dispatch",
  ]);
  if (publish) {
    requireEvidence(
      token &&
        allowedEvents.has(eventName) &&
        validSha(workflowSha) &&
        typeof event?.repository?.default_branch === "string" &&
        validNodeId(event.repository.node_id) &&
        workflowRef ===
          `${repository}/.github/workflows/coderabbit-approval.yml@refs/heads/${event.repository.default_branch}`,
      "Publishing requires the trusted default-branch approval workflow.",
    );
  }
  const client = githubClient(options);
  if (
    eventName === "check_run" &&
    (event.check_run?.app?.id !== app.id ||
      event.check_run?.app?.slug !== app.slug)
  )
    return [];
  if (
    eventName === "workflow_run" &&
    (event.workflow_run?.event !== "pull_request_review" ||
      event.workflow_run?.path !== ".github/workflows/review-events.yml" ||
      event.workflow_run?.repository?.full_name !== repository)
  )
    return [];
  requireEvidence(
    allowedEvents.has(eventName) ||
      ["pull_request", "pull_request_review"].includes(eventName),
    "A supported pull request or trusted workflow event is required.",
  );
  const pulls = event.pull_request
    ? [event.pull_request]
    : await client.list("pulls?state=open&per_page=100");
  const settled = await Promise.allSettled(
    pulls.map((pull) => verifyPull(options, pull, client)),
  );
  const failures = settled
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(
      failures,
      "CodeRabbit approval could not be verified for every pull request.",
    );
  return settled.map((result) => result.value);
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    requireEvidence(
      process.env.GITHUB_EVENT_PATH &&
        (process.argv.length === 2 ||
          (process.argv.length === 3 && process.argv[2] === "--publish")),
      "Run with a GitHub event file and optional --publish argument.",
    );
    const results = await runCodeRabbitApproval({
      event: JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8")),
      eventName: process.env.GITHUB_EVENT_NAME,
      publish: process.argv[2] === "--publish",
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      workflowRef: process.env.GITHUB_WORKFLOW_REF,
      workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    });
    for (const result of results) console.log(JSON.stringify(result));
    if (results.some((result) => !result.approved)) process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof EvidenceError
        ? error.message
        : "CodeRabbit approval verification failed.",
    );
    process.exitCode = 1;
  }
}
