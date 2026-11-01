import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parse } from "yaml";

import {
  inspectCodeRabbitApproval,
  runCodeRabbitApproval,
} from "./check-coderabbit-approval.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const repository = "example/api";
const pull = (overrides = {}) => ({
  base: { sha: base },
  head: { sha: head },
  id: 101,
  number: 1,
  state: "open",
  ...overrides,
});
const review = (overrides = {}) => ({
  commit_id: head,
  id: 201,
  state: "APPROVED",
  user: { id: 136622811, login: "coderabbitai[bot]", type: "Bot" },
  ...overrides,
});
const check = (overrides = {}) => ({
  app: { id: 347564, slug: "coderabbitai" },
  conclusion: "success",
  head_sha: head,
  id: 301,
  name: "CodeRabbit",
  output: { title: "Finished" },
  status: "completed",
  ...overrides,
});
const response = (data, link) =>
  new Response(JSON.stringify(data), {
    headers: link ? { link } : {},
    status: 200,
  });
const fixture = ({
  reviews = [review()],
  checks = [check()],
  metadata = pull(),
} = {}) => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ options, url });
    if (options.method === "POST") return response({ id: 901 });
    if (options.method === "PATCH") return response({ id: 901 });
    if (url.includes("/reviews")) return response(reviews);
    if (url.includes("/commits/"))
      return response({ check_runs: checks, total_count: checks.length });
    if (url.includes("pulls?")) return response([metadata]);
    return response(metadata);
  };
  return { fetchImpl, requests };
};
const inspect = (fetchImpl, overrides = {}) =>
  inspectCodeRabbitApproval({
    expectedHeadSha: head,
    fetchImpl,
    pullNumber: 1,
    repository,
    ...overrides,
  });
const run = (fetchImpl, overrides = {}) =>
  runCodeRabbitApproval({
    event: { pull_request: pull(), repository: { default_branch: "main" } },
    eventName: "pull_request_target",
    fetchImpl,
    publish: true,
    repository,
    token: "synthetic-token",
    workflowRef: `${repository}/.github/workflows/coderabbit-approval.yml@refs/heads/main`,
    workflowSha: base,
    ...overrides,
  });

test("accepts the exact bot's current-head approval and completed native review", async () => {
  const { fetchImpl, requests } = fixture();
  assert.deepEqual(await inspect(fetchImpl), {
    checkRunId: 301,
    headSha: head,
    pullNumber: 1,
    reviewId: 201,
  });
  assert.equal(requests.length, 6);
  assert.ok(
    requests.every(
      ({ options }) => options.method === "GET" && options.redirect === "error",
    ),
  );
});

test("human, lookalike and mismatched bot identities cannot supply approval", async () => {
  for (const user of [
    { id: 42, login: "human", type: "User" },
    { id: 42, login: "coderabbitai[bot]", type: "Bot" },
    { id: 136622811, login: "lookalike[bot]", type: "Bot" },
    { id: 136622811, login: "coderabbitai[bot]", type: "User" },
  ])
    await assert.rejects(
      inspect(fixture({ reviews: [review({ user })] }).fetchImpl),
      /latest CodeRabbit review/,
    );
});

test("missing, stale, dismissed, commented and requested-changes reviews block approval", async () => {
  await assert.rejects(
    inspect(fixture({ reviews: [] }).fetchImpl),
    /latest CodeRabbit review/,
  );
  for (const update of [
    { commit_id: base },
    { state: "DISMISSED" },
    { state: "COMMENTED" },
    { state: "CHANGES_REQUESTED" },
    { state: "PENDING" },
  ])
    await assert.rejects(
      inspect(fixture({ reviews: [review(update)] }).fetchImpl),
      /latest CodeRabbit review/,
    );
  await assert.rejects(
    inspect(
      fixture({ reviews: [review(), review({ id: 202, state: "DISMISSED" })] })
        .fetchImpl,
    ),
    /latest CodeRabbit review/,
  );
});

test("all review pages determine the latest verdict, including later dismissals", async () => {
  const basic = fixture();
  const fetchImpl = async (url, options) => {
    if (!url.includes("/reviews")) return basic.fetchImpl(url, options);
    if (url.includes("page=2"))
      return response([review({ id: 202, state: "DISMISSED" })]);
    return response(
      [review()],
      `<https://api.github.com/repos/${repository}/pulls/1/reviews?per_page=100&page=2>; rel="next"`,
    );
  };
  await assert.rejects(inspect(fetchImpl), /latest CodeRabbit review/);
});

test("a later approval page is read sequentially for both evidence snapshots", async () => {
  const basic = fixture();
  const firstPage = `https://api.github.com/repos/${repository}/pulls/1/reviews?per_page=100`;
  const secondPage = `${firstPage}&page=2`;
  const reviewPages = [];
  const fetchImpl = async (url, options) => {
    if (!url.includes("/reviews")) return basic.fetchImpl(url, options);

    reviewPages.push(url);
    if (url === secondPage) return response([review({ id: 202 })]);
    return response(
      [review({ state: "COMMENTED" })],
      `<${secondPage}>; rel="next"`,
    );
  };

  assert.equal((await inspect(fetchImpl)).reviewId, 202);
  assert.deepEqual(reviewPages, [firstPage, secondPage, firstPage, secondPage]);
});

test("native progress success cannot replace strict completed-review success", async () => {
  for (const update of [
    { conclusion: "skipped" },
    { conclusion: "neutral" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: null, status: "in_progress" },
    { output: { title: "Review skipped" } },
    { output: { title: "Review approved" } },
    { head_sha: base },
    { app: { id: 42, slug: "coderabbitai" } },
    { app: { id: 347564, slug: "other-app" } },
  ])
    await assert.rejects(
      inspect(fixture({ checks: [check(update)] }).fetchImpl),
      /latest native CodeRabbit check/,
    );
  await assert.rejects(
    inspect(fixture({ checks: [] }).fetchImpl),
    /latest native CodeRabbit check/,
  );
});

test("a newer pending or skipped run overrides an older success across check pages", async () => {
  const basic = fixture();
  const fetchImpl = async (url, options) => {
    if (!url.includes("/commits/")) return basic.fetchImpl(url, options);
    if (url.includes("page=2"))
      return response({
        check_runs: [check({ conclusion: "skipped", id: 302 })],
        total_count: 2,
      });
    return response(
      { check_runs: [check()], total_count: 2 },
      `<https://api.github.com/repos/${repository}/commits/${head}/check-runs?per_page=100&filter=all&page=2>; rel="next"`,
    );
  };
  await assert.rejects(inspect(fetchImpl), /latest native CodeRabbit check/);
});

test("unrelated check changes do not invalidate stable CodeRabbit evidence", async () => {
  const basic = fixture();
  let reads = 0;
  const fetchImpl = async (url, options) => {
    if (!url.includes("/commits/")) return basic.fetchImpl(url, options);
    return response({
      check_runs: [
        check(),
        check({
          id: 401,
          name: "CI",
          status: ++reads === 1 ? "in_progress" : "completed",
        }),
      ],
      total_count: 2,
    });
  };
  assert.equal((await inspect(fetchImpl)).reviewId, 201);
});

test("head, base, review and provider-check races fail closed", async () => {
  for (const changed of ["head", "base", "review", "check"]) {
    const basic = fixture();
    let reads = 0;
    const fetchImpl = async (url, options) => {
      const matches =
        changed === "review"
          ? url.includes("/reviews")
          : changed === "check"
            ? url.includes("/commits/")
            : url.endsWith("/pulls/1");
      if (!matches || ++reads === 1) return basic.fetchImpl(url, options);
      if (changed === "review")
        return response([review({ state: "DISMISSED" })]);
      if (changed === "check")
        return response({
          check_runs: [check({ conclusion: "neutral" })],
          total_count: 1,
        });
      return response(pull({ [changed]: { sha: "c".repeat(40) } }));
    };
    await assert.rejects(inspect(fetchImpl), /changed during verification/);
  }
  await assert.rejects(
    inspect(fixture({ metadata: pull({ head: { sha: base } }) }).fetchImpl),
    /stale PR head/,
  );
});

test("off-host, off-endpoint, repeated, ambiguous and malformed pagination is rejected", async () => {
  const reviewsUrl = `https://api.github.com/repos/${repository}/pulls/1/reviews?per_page=100`;
  for (const link of [
    '<https://attacker.example/reviews?per_page=100>; rel="next"',
    '<https://api.github.com/repos/other/api/reviews?per_page=100>; rel="next"',
    `<${reviewsUrl}>; rel="next"`,
    `<${reviewsUrl}&page=2>; rel="next", <${reviewsUrl}&page=3>; rel="next"`,
    "not a pagination header",
  ]) {
    const basic = fixture();
    await assert.rejects(
      inspect(async (url, options) =>
        url.includes("/reviews")
          ? response([review()], link)
          : basic.fetchImpl(url, options),
      ),
      /pagination/,
    );
    assert.ok(basic.requests.every(({ url }) => !url.includes("attacker")));
  }
});

test("incomplete check counts, duplicate evidence and unavailable pages fail closed", async () => {
  for (const data of [
    { check_runs: [check()], total_count: 2 },
    { check_runs: [check(), check()], total_count: 2 },
    { check_runs: null, total_count: 0 },
  ]) {
    const basic = fixture();
    await assert.rejects(
      inspect(async (url, options) =>
        url.includes("/commits/")
          ? response(data)
          : basic.fetchImpl(url, options),
      ),
      /incomplete|duplicate|invalid/,
    );
  }
  await assert.rejects(
    inspect(async () => new Response("unavailable", { status: 503 })),
    /HTTP 503/,
  );
});

test("trusted publishing creates a blocking check before reading and completes it from live evidence", async () => {
  const { fetchImpl, requests } = fixture();
  assert.equal((await run(fetchImpl))[0].approved, true);
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    head_sha: head,
    name: "CodeRabbit approval",
    status: "in_progress",
  });
  const published = JSON.parse(requests.at(-1).options.body);
  assert.equal(published.conclusion, "success");
  assert.equal(published.status, "completed");
});

test("independent PR verifications settle before publishing failures are aggregated", async () => {
  const secondHead = "c".repeat(40);
  const secondPull = pull({ head: { sha: secondHead }, id: 102, number: 2 });
  const firstFailure = new Error("Synthetic first PR publishing failure");
  const completed = [];
  const fetchImpl = async (url, options) => {
    if (options.method === "POST") {
      if (JSON.parse(options.body).head_sha === head) throw firstFailure;
      return response({ id: 902 });
    }
    if (options.method === "PATCH") {
      completed.push(JSON.parse(options.body));
      return response({ id: 902 });
    }
    if (url.includes("pulls?")) return response([pull(), secondPull]);
    if (url.includes("/reviews"))
      return response([review({ commit_id: secondHead })]);
    if (url.includes("/commits/"))
      return response({
        check_runs: [check({ head_sha: secondHead })],
        total_count: 1,
      });
    return response(secondPull);
  };

  await assert.rejects(
    run(fetchImpl, {
      event: { repository: { default_branch: "main" } },
      eventName: "workflow_dispatch",
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 1 &&
      error.errors[0] === firstFailure &&
      error.message ===
        "CodeRabbit approval could not be verified for every pull request.",
  );
  assert.equal(completed.length, 1);
  assert.equal(completed[0].conclusion, "success");
  assert.match(completed[0].output.summary, /^PR #2 /);
});

test("a dismissed review publishes failure and raw network errors stay out of diagnostics", async () => {
  const basic = fixture({ reviews: [review({ state: "DISMISSED" })] });
  assert.equal((await run(basic.fetchImpl))[0].approved, false);
  assert.equal(
    JSON.parse(basic.requests.at(-1).options.body).conclusion,
    "failure",
  );
  const safe = fixture();
  const results = await run(async (url, options) => {
    if (options.method === "GET")
      throw new Error("private network details synthetic-token");
    return safe.fetchImpl(url, options);
  });
  assert.equal(results[0].message, "GitHub review evidence could not be read.");
  assert.ok(!safe.requests.at(-1).options.body.includes("synthetic-token"));
});

test("publishing rejects PR-head and nondefault workflows before making any requests", async () => {
  for (const update of [
    { eventName: "pull_request_review" },
    { workflowSha: "invalid" },
    {
      workflowRef: `${repository}/.github/workflows/coderabbit-approval.yml@refs/heads/untrusted`,
    },
    { token: undefined },
  ]) {
    const basic = fixture();
    await assert.rejects(
      run(basic.fetchImpl, update),
      /trusted default-branch/,
    );
    assert.equal(basic.requests.length, 0);
  }
});

test("read-only review evaluation uses no write API or authorization when no token is supplied", async () => {
  const { fetchImpl, requests } = fixture();
  assert.equal(
    (
      await run(fetchImpl, {
        eventName: "pull_request_review",
        publish: false,
        token: undefined,
      })
    )[0].approved,
    true,
  );
  assert.ok(
    requests.every(
      ({ options }) =>
        options.method === "GET" && !options.headers.Authorization,
    ),
  );
});

test("review relay and native completion events reread open PRs without trusting their outcome", async () => {
  for (const event of [
    {
      workflow_run: {
        conclusion: "failure",
        event: "pull_request_review",
        path: ".github/workflows/review-events.yml",
        repository: { full_name: repository },
      },
    },
    { check_run: { app: { id: 347564, slug: "coderabbitai" } } },
  ]) {
    const basic = fixture();
    const results = await run(basic.fetchImpl, {
      event: { ...event, repository: { default_branch: "main" } },
      eventName: event.workflow_run ? "workflow_run" : "check_run",
    });
    assert.equal(results[0].approved, true);
    assert.ok(basic.requests[0].url.includes("pulls?state=open"));
  }
  for (const update of [
    {
      eventName: "check_run",
      event: {
        check_run: { app: { id: 42 } },
        repository: { default_branch: "main" },
      },
    },
    {
      eventName: "workflow_run",
      event: {
        workflow_run: { event: "push" },
        repository: { default_branch: "main" },
      },
    },
  ]) {
    const basic = fixture();
    assert.deepEqual(await run(basic.fetchImpl, update), []);
    assert.equal(basic.requests.length, 0);
  }
});

test("invalid targets and incomplete PR metadata fail before evidence enumeration", async () => {
  for (const update of [
    { pullNumber: 0 },
    { expectedHeadSha: undefined },
    { repository: "../.." },
  ]) {
    const basic = fixture();
    await assert.rejects(inspect(basic.fetchImpl, update), /required/);
    assert.equal(basic.requests.length, 0);
  }
  await assert.rejects(
    inspect(fixture({ metadata: pull({ state: "closed" }) }).fetchImpl),
    /open pull request/,
  );
});

test("workflow privilege boundaries preserve default-branch code and an inert review relay", async () => {
  const approval = parse(
    await readFile(
      new URL("../.github/workflows/coderabbit-approval.yml", import.meta.url),
      "utf8",
    ),
  );
  const relay = parse(
    await readFile(
      new URL("../.github/workflows/review-events.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(relay.permissions, {});
  assert.deepEqual(relay.on.pull_request_review.types, [
    "submitted",
    "dismissed",
    "edited",
  ]);
  assert.equal(relay.jobs.notify.steps.length, 1);
  assert.equal(relay.jobs.notify.steps[0].uses, undefined);
  assert.deepEqual(approval.permissions, {
    contents: "read",
    "pull-requests": "read",
    checks: "write",
  });
  assert.equal(
    approval.jobs.verify.steps[0].with.ref,
    "${{ github.workflow_sha }}",
  );
  assert.equal(
    approval.jobs.verify.steps[0].with["persist-credentials"],
    false,
  );
  assert.equal(
    approval.jobs.verify.steps.at(-1).run,
    "node scripts/check-coderabbit-approval.mjs --publish",
  );
  assert.equal(approval.on.pull_request_review, undefined);
});
