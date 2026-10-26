import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  evaluateReviewEvidence,
  inspectReviewApprovals,
  readReviewInputs,
} from "./check-review-approvals.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const policy = {
  codeRabbitUserId: 12345,
  requiredCiContexts: [
    "Bootstrap governance (API not published)",
    "PR file limit",
  ],
  sonarCheckName: "SonarCloud Code Analysis",
};
const review = (overrides = {}) => ({
  commit_id: head,
  id: 1,
  state: "APPROVED",
  submitted_at: "2026-10-26T12:00:00Z",
  user: {
    id: policy.codeRabbitUserId,
    login: "coderabbitai[bot]",
    type: "Bot",
  },
  ...overrides,
});
const check = (id, name, appId, overrides = {}) => ({
  app: { id: appId },
  conclusion: "success",
  head_sha: head,
  id,
  name,
  status: "completed",
  ...overrides,
});
const checks = () => [
  check(10, policy.sonarCheckName, 12526),
  ...policy.requiredCiContexts.map((name, index) =>
    check(11 + index, name, 15368),
  ),
];
const thread = (id, overrides = {}) => ({
  id,
  isOutdated: false,
  isResolved: true,
  ...overrides,
});
const evaluate = (overrides = {}) =>
  evaluateReviewEvidence({
    checks: checks(),
    headSha: head,
    policy,
    reviews: [review()],
    threads: [thread("thread-1")],
    ...overrides,
  });
const pull = (overrides = {}) => ({
  base: { ref: "main", repo: { full_name: "example/api" }, sha: base },
  draft: false,
  head: { sha: head },
  number: 1,
  state: "open",
  ...overrides,
});
const response = (data, link) =>
  new Response(JSON.stringify(data), {
    headers: link ? { link } : {},
    status: 200,
  });
const graphql = (threads, reviewCount = 1, overrides = {}) => ({
  data: {
    repository: {
      pullRequest: {
        baseRefOid: base,
        headRefOid: head,
        reviews: { totalCount: reviewCount },
        reviewThreads: {
          nodes: threads,
          pageInfo: { endCursor: null, hasNextPage: false },
          totalCount: threads.length,
        },
        ...overrides,
      },
    },
  },
});
const fixture =
  ({
    onRequest,
    reviews = [review()],
    runs = checks(),
    threads = [thread("thread-1")],
  } = {}) =>
  async (url, options) => {
    const custom = await onRequest?.(url, options);
    if (custom) return custom;
    if (url.endsWith("/graphql"))
      return response(graphql(threads, reviews.length));
    if (url.includes("/reviews?")) return response(reviews);
    if (url.includes("/check-runs?"))
      return response({ check_runs: runs, total_count: runs.length });
    return response(pull());
  };
const inspect = (fetchImpl = fixture(), overrides = {}) =>
  inspectReviewApprovals({
    expectedHeadSha: head,
    fetchImpl,
    policy,
    pullNumber: 1,
    repository: "example/api",
    ...overrides,
  });

test("requires genuine exact-head approval, pinned Sonar and CI apps, and resolved threads", () => {
  const result = evaluate();

  assert.equal(result.passed, true);
  assert.equal(result.evidenceSnapshotOnly, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.codeRabbit.userId, policy.codeRabbitUserId);
  assert.equal(result.sonar.appId, 12526);
  assert.ok(result.ci.every((run) => run.appId === 15368));
});

test("old-head approval, COMMENTED, pending, dismissed and changes-requested reviews never pass", () => {
  for (const state of [
    "COMMENTED",
    "PENDING",
    "DISMISSED",
    "CHANGES_REQUESTED",
  ]) {
    const result = evaluate({ reviews: [review({ state })] });
    assert.equal(result.passed, false, state);
  }
  assert.equal(
    evaluate({ reviews: [review({ commit_id: "c".repeat(40) })] }).passed,
    false,
  );
  assert.equal(evaluate({ reviews: [] }).passed, false);
});

test("latest submitted bot review supersedes approval regardless of array order or old commit", () => {
  const approved = review();
  const newer = review({
    id: 2,
    state: "DISMISSED",
    submitted_at: "2026-10-26T13:00:00Z",
  });
  for (const reviews of [
    [approved, newer],
    [newer, approved],
  ])
    assert.equal(evaluate({ reviews }).codeRabbit.state, "DISMISSED");
  assert.equal(
    evaluate({
      reviews: [
        approved,
        review({
          id: 3,
          state: "COMMENTED",
          submitted_at: approved.submitted_at,
        }),
      ],
    }).passed,
    false,
  );
  assert.equal(
    evaluate({
      reviews: [
        approved,
        review({ id: 4, state: "PENDING", submitted_at: null }),
      ],
    }).passed,
    false,
  );
});

test("human approval cannot replace the exact bot, and conflicting or incomplete identity fails closed", () => {
  assert.equal(
    evaluate({
      reviews: [review({ user: { id: 5, login: "human", type: "User" } })],
    }).passed,
    false,
  );
  for (const user of [
    { id: 6, login: "coderabbitai[bot]", type: "Bot" },
    { id: policy.codeRabbitUserId, login: "impostor", type: "Bot" },
    { id: policy.codeRabbitUserId, login: "coderabbitai[bot]", type: "User" },
    null,
  ])
    assert.throws(
      () => evaluate({ reviews: [review(), review({ id: 2, user })] }),
      /metadata/,
    );
  assert.throws(
    () => evaluate({ reviews: [review({ submitted_at: null })] }),
    /metadata/,
  );
});

test("newer queued, failed, neutral or skipped reruns beat old success", () => {
  for (const overrides of [
    { conclusion: null, status: "queued" },
    { conclusion: null, status: "in_progress" },
    { conclusion: "failure" },
    { conclusion: "neutral" },
    { conclusion: "skipped" },
    { conclusion: "cancelled" },
  ]) {
    const result = evaluate({
      checks: [...checks(), check(99, policy.sonarCheckName, 12526, overrides)],
    });
    assert.equal(result.sonar.id, 99);
    assert.equal(result.passed, false);
  }
});

test("wrong app or check name cannot satisfy Sonar or required CI", () => {
  for (const overrides of [
    { app: { id: 15368 } },
    { name: "scanner job success" },
  ]) {
    const runs = checks();
    runs[0] = { ...runs[0], ...overrides };
    assert.equal(evaluate({ checks: runs }).sonar.passed, false);
  }
  const runs = checks();
  runs[1].app.id = 999;
  const result = evaluate({ checks: runs });
  assert.equal(result.ci[0].passed, false);
  assert.equal(result.passed, false);
  const queued = evaluate({
    checks: [
      ...checks(),
      check(99, policy.requiredCiContexts[0], 15368, {
        conclusion: null,
        status: "queued",
      }),
    ],
  });
  assert.equal(queued.ci[0].id, 99);
  assert.equal(queued.passed, false);
  assert.throws(
    () =>
      evaluate({
        checks: [
          ...checks(),
          check(99, policy.sonarCheckName, 12526, { app: null }),
        ],
      }),
    /metadata/,
  );
  assert.throws(
    () =>
      evaluate({
        checks: [
          check(10, policy.sonarCheckName, 12526, { head_sha: "c".repeat(40) }),
        ],
      }),
    /metadata/,
  );
});

test("any unresolved thread blocks, including outdated threads; malformed/duplicate evidence fails", () => {
  const result = evaluate({
    threads: [thread("old", { isOutdated: true, isResolved: false })],
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.unresolvedThreads, ["old"]);
  assert.throws(
    () => evaluate({ threads: [thread("same"), thread("same")] }),
    /duplicate/,
  );
  assert.throws(
    () => evaluate({ threads: [{ id: "missing-resolution" }] }),
    /incomplete/,
  );
  assert.throws(() => evaluate({ reviews: [review(), review()] }), /duplicate/);
  assert.throws(
    () => evaluate({ checks: [...checks(), checks()[0]] }),
    /duplicate/,
  );
});

test("required nonsecret policy inputs cannot silently fall back or accept empty CI", () => {
  for (const overrides of [
    { codeRabbitUserId: 0 },
    { codeRabbitUserId: "12345" },
    { sonarCheckName: "" },
    { requiredCiContexts: [] },
    { requiredCiContexts: ["duplicate", "duplicate"] },
    { requiredCiContexts: [policy.sonarCheckName] },
  ])
    assert.throws(
      () => evaluate({ policy: { ...policy, ...overrides } }),
      /required/,
    );
});

test("fetches only read-only evidence and checks head/base metadata before and after", async () => {
  const requests = [];
  const result = await inspect(
    fixture({
      onRequest: (url, options) => {
        requests.push({ options, url });
      },
    }),
    { token: "synthetic-token" },
  );

  assert.equal(result.passed, true);
  assert.equal(result.baseSha, base);
  assert.equal(
    requests.filter(({ url }) => url.endsWith("/pulls/1")).length,
    2,
  );
  for (const { options, url } of requests) {
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    assert.ok(options.signal instanceof AbortSignal);
    if (options.method === "POST") {
      assert.ok(url.endsWith("/graphql"));
      assert.match(JSON.parse(options.body).query, /^query ReviewEvidence/);
    } else assert.equal(options.method, "GET");
  }
});

test("paginates more than 100 reviews, check runs and threads and finds an unresolved last-page thread", async () => {
  const reviews = Array.from({ length: 101 }, (_, index) =>
    review({ id: index + 1, user: { id: 7, login: "human", type: "User" } }),
  );
  reviews[100] = review({ id: 101 });
  const runs = Array.from({ length: 103 }, (_, index) =>
    check(index + 1, `other-${index}`, 999),
  );
  runs.splice(
    100,
    3,
    ...checks().map((run, index) => ({ ...run, id: 200 + index })),
  );
  const threads = Array.from({ length: 101 }, (_, index) =>
    thread(`thread-${index}`, { isResolved: index !== 100 }),
  );
  const requests = [];
  const result = await inspect(
    fixture({
      onRequest: (url, options) => {
        requests.push(url);
        const endpoint = new URL(url);
        const second = endpoint.searchParams.get("page") === "2";
        if (url.includes("/reviews?")) {
          endpoint.searchParams.set("page", "2");
          return response(
            second ? reviews.slice(100) : reviews.slice(0, 100),
            second ? undefined : `<${endpoint.href}>; rel="next"`,
          );
        }
        if (url.includes("/check-runs?")) {
          endpoint.searchParams.set("page", "2");
          return response(
            {
              check_runs: second ? runs.slice(100) : runs.slice(0, 100),
              total_count: runs.length,
            },
            second ? undefined : `<${endpoint.href}>; rel="next"`,
          );
        }
        if (url.endsWith("/graphql")) {
          const next = JSON.parse(options.body).variables.cursor === "cursor-1";
          return response(
            graphql([], reviews.length, {
              reviewThreads: {
                nodes: next ? threads.slice(100) : threads.slice(0, 100),
                pageInfo: {
                  endCursor: next ? null : "cursor-1",
                  hasNextPage: !next,
                },
                totalCount: threads.length,
              },
            }),
          );
        }
      },
    }),
  );

  assert.equal(result.codeRabbit.passed, true);
  assert.equal(result.sonar.passed, true);
  assert.equal(result.passed, false);
  assert.deepEqual(result.unresolvedThreads, ["thread-100"]);
  assert.equal(requests.length, 8);
});

test("fails closed on missing review/check/thread pages and duplicate IDs", async () => {
  for (const onRequest of [
    (url) => (url.endsWith("/graphql") ? response(graphql([], 2)) : undefined),
    (url) =>
      url.includes("/check-runs?")
        ? response({ check_runs: checks(), total_count: 4 })
        : undefined,
    (url) =>
      url.endsWith("/graphql")
        ? response(
            graphql([], 1, {
              reviewThreads: {
                nodes: [],
                pageInfo: { endCursor: null, hasNextPage: false },
                totalCount: 1,
              },
            }),
          )
        : undefined,
    (url) =>
      url.includes("/reviews?")
        ? response([review(), review()])
        : url.endsWith("/graphql")
          ? response(graphql([], 2))
          : undefined,
  ])
    await assert.rejects(
      inspect(fixture({ onRequest })),
      /incomplete|duplicate/,
    );
});

test("rejects head/base races, old event heads, wrong branch, closed/draft and missing metadata", async () => {
  for (const field of ["head", "base"]) {
    let reads = 0;
    await assert.rejects(
      inspect(
        fixture({
          onRequest: (url) => {
            if (!url.endsWith("/pulls/1")) return undefined;
            reads++;
            return response(
              pull(
                reads === 2
                  ? { [field]: { ...pull()[field], sha: "c".repeat(40) } }
                  : {},
              ),
            );
          },
        }),
      ),
      /changed/,
    );
  }
  for (const metadata of [
    {},
    pull({ draft: true }),
    pull({ state: "closed" }),
    pull({ base: { ...pull().base, ref: "another" } }),
    pull({ base: { ...pull().base, repo: { full_name: "other/api" } } }),
    pull({ head: { sha: "c".repeat(40) } }),
  ])
    await assert.rejects(
      inspect(
        fixture({
          onRequest: (url) =>
            url.endsWith("/pulls/1") ? response(metadata) : undefined,
        }),
      ),
      /metadata|older/,
    );
});

test("never forwards credentials to unsafe, repeated, skipped or malformed next-page links", async () => {
  const endpoint = "https://api.github.com/repos/example/api/pulls/1/reviews";
  for (const link of [
    '<https://untrusted.example/reviews?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repos/other/api/pulls/1/reviews?per_page=100&page=2>; rel="next"',
    `<https://user:pass@api.github.com/repos/example/api/pulls/1/reviews?per_page=100&page=2>; rel="next"`,
    `<${endpoint}?per_page=100&page=1>; rel="next"`,
    `<${endpoint}?per_page=100&page=3>; rel="next"`,
    `<${endpoint}?per_page=1&page=2>; rel="next"`,
    `<${endpoint}?per_page=100&page=2>; rel="next", <${endpoint}?per_page=100&page=3>; rel="next"`,
    `${"<".repeat(50_000)}`,
    `prefix<${endpoint}?per_page=100&page=2>; rel="next"`,
  ]) {
    const urls = [];
    await assert.rejects(
      inspect(
        fixture({
          onRequest: (url) => {
            urls.push(url);
            if (url.includes("/reviews?")) return response([review()], link);
          },
        }),
        { token: "synthetic-token" },
      ),
      /pagination/,
    );
    assert.ok(
      urls.every((url) => new URL(url).origin === "https://api.github.com"),
    );
    assert.equal(urls.filter((url) => url.includes("/reviews?")).length, 1);
  }
});

test("GraphQL errors, stale SHAs, changing totals and bad/repeated cursors block", async () => {
  for (const body of [
    { errors: [{ message: "synthetic failure" }] },
    graphql([], 1, { headRefOid: "c".repeat(40) }),
    graphql([], 1, { baseRefOid: "c".repeat(40) }),
    graphql([], 1, {
      reviewThreads: {
        nodes: [],
        totalCount: 1,
        pageInfo: { endCursor: null, hasNextPage: true },
      },
    }),
    graphql([], 1, {
      reviewThreads: {
        nodes: [],
        totalCount: 1,
        pageInfo: { endCursor: "repeated", hasNextPage: true },
      },
    }),
  ])
    await assert.rejects(
      inspect(
        fixture({
          onRequest: (url) =>
            url.endsWith("/graphql") ? response(body) : undefined,
        }),
      ),
      /GraphQL|cursor/,
    );
  let pages = 0;
  await assert.rejects(
    inspect(
      fixture({
        onRequest: (url) => {
          if (!url.endsWith("/graphql")) return undefined;
          pages++;
          return response(
            graphql([], 1, {
              reviewThreads: {
                nodes: [thread(`thread-${pages}`)],
                totalCount: pages,
                pageInfo: { endCursor: "next", hasNextPage: pages === 1 },
              },
            }),
          );
        },
      }),
    ),
    /changing/,
  );
});

test("HTTP errors, unreadable data, fetch errors and timeouts are sanitized and fail closed", async () => {
  for (const status of [403, 429, 500])
    await assert.rejects(
      inspect(
        async () => new Response("synthetic private response", { status }),
      ),
      new RegExp(`HTTP ${status}`),
    );
  await assert.rejects(
    inspect(async () => new Response("not-json")),
    /unreadable/,
  );
  await assert.rejects(
    inspect(async () => {
      throw new Error("synthetic-token");
    }),
    /request failed/,
  );
  await assert.rejects(
    inspect(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(response(pull())), 100);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
      { timeoutMs: 5 },
    ),
    /timed out/,
  );
});

test("invalid target, API endpoints and timeout are rejected before any request", async () => {
  for (const overrides of [
    { repository: "../.." },
    { repository: "owner/../other" },
    { pullNumber: 0 },
    { expectedHeadSha: undefined },
    { apiUrl: "http://api.github.com" },
    { graphqlUrl: "https://untrusted.example/graphql" },
    { graphqlUrl: "https://api.github.com/graphql?token=secret" },
    { timeoutMs: 0 },
    { timeoutMs: 120_001 },
  ]) {
    let requests = 0;
    await assert.rejects(
      inspect(async () => {
        requests++;
        throw new Error("unexpected");
      }, overrides),
    );
    assert.equal(requests, 0);
  }
});

test("accepts explicit or event PR inputs and rejects conflicts and missing policy", () => {
  const env = {
    GITHUB_REPOSITORY: "example/api",
    REVIEW_CODERABBIT_USER_ID: "12345",
    REVIEW_HEAD_SHA: head,
    REVIEW_PULL_NUMBER: "1",
    REVIEW_REQUIRED_CI_CONTEXTS: JSON.stringify(policy.requiredCiContexts),
    REVIEW_SONAR_CHECK_NAME: policy.sonarCheckName,
  };
  assert.equal(readReviewInputs(env).pullNumber, 1);
  assert.equal(
    readReviewInputs(
      { ...env, REVIEW_PULL_NUMBER: undefined, REVIEW_HEAD_SHA: undefined },
      { pull_request: pull() },
    ).expectedHeadSha,
    head,
  );
  assert.throws(
    () => readReviewInputs(env, { pull_request: pull({ number: 2 }) }),
    /disagree/,
  );
  assert.throws(
    () =>
      readReviewInputs(env, {
        pull_request: pull({ head: { sha: "c".repeat(40) } }),
      }),
    /disagree/,
  );
  assert.throws(
    () => readReviewInputs({ ...env, REVIEW_REQUIRED_CI_CONTEXTS: "not-json" }),
    /JSON/,
  );
  assert.throws(
    () => readReviewInputs({ ...env, REVIEW_CODERABBIT_USER_ID: undefined }),
    /required/,
  );
});

test("CLI exits nonzero without policy and never echoes credentials", () => {
  const result = spawnSync(
    process.execPath,
    [
      new URL("./check-review-approvals.mjs", import.meta.url).pathname.replace(
        /^\/([A-Za-z]:)/,
        "$1",
      ),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: "",
        GITHUB_TOKEN: "synthetic-secret-token",
        REVIEW_REQUIRED_CI_CONTEXTS: "",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).passed, false);
  assert.doesNotMatch(result.stderr, /synthetic-secret-token/);
});
