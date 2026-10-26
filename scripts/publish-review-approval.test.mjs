import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import {
  createGitHubAppJwt,
  publishReviewApproval,
  readPublisherInputs,
} from "./publish-review-approval.mjs";

const clock = Date.parse("2026-10-26T12:00:00Z");
const headSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const policy = {
  baseBranch: "main",
  codeRabbitUserId: 1234,
  repository: "example/project",
  repositoryId: 99,
  requiredCiContexts: ["Bootstrap", "Sonar scanner"],
  schemaVersion: 1,
  sonarCheckName: "SonarCloud Code Analysis",
};
const passingCheck = (id, name, appId) => ({
  appId,
  conclusion: "success",
  id,
  name,
  passed: true,
  status: "completed",
});
const evidence = () => ({
  baseBranch: "main",
  baseSha,
  ci: [
    passingCheck(10, "Bootstrap", 15368),
    passingCheck(11, "Sonar scanner", 15368),
  ],
  codeRabbit: {
    commitSha: headSha,
    id: 8,
    passed: true,
    state: "APPROVED",
    userId: 1234,
  },
  evidenceSnapshotOnly: true,
  headSha,
  passed: true,
  reasons: [],
  sonar: passingCheck(9, "SonarCloud Code Analysis", 12526),
  unresolvedThreads: [],
});
const pull = () => ({
  base: {
    ref: "main",
    repo: { full_name: "example/project", id: 99 },
    sha: baseSha,
  },
  draft: false,
  head: { sha: headSha },
  number: 7,
  state: "open",
});
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const fixture = () => {
  const calls = [];
  let pullReads = 0;
  const state = {
    app: { id: 101 },
    checkAppId: 101,
    checkHeadSha: headSha,
    completionStatus: 200,
    installation: {
      account: { login: "example" },
      app_id: 101,
      id: 202,
      suspended_at: null,
    },
    pulls: [pull(), pull()],
    scope: {
      repositories: [{ full_name: "example/project", id: 99 }],
      total_count: 1,
    },
    token: {
      expires_at: new Date(clock + 3_600_000).toISOString(),
      permissions: {
        checks: "write",
        contents: "read",
        metadata: "read",
        pull_requests: "read",
      },
      token: "synthetic-installation-token",
    },
  };
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ body, options, url });
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["X-GitHub-Api-Version"], "2026-03-10");
    if (url.pathname === "/app") return response(state.app);
    if (url.pathname === "/repos/example/project/installation")
      return response(state.installation);
    if (url.pathname === "/app/installations/202/access_tokens")
      return response(state.token, 201);
    if (url.pathname === "/installation/repositories")
      return response(state.scope);
    if (url.pathname === "/repos/example/project/pulls/7")
      return response(
        state.pulls[Math.min(pullReads++, state.pulls.length - 1)],
      );
    if (url.pathname === "/repos/example/project/pulls/7/reviews")
      return response([
        {
          commit_id: headSha,
          id: 8,
          state: "APPROVED",
          submitted_at: new Date(clock).toISOString(),
          user: { id: 1234, login: "coderabbitai[bot]", type: "Bot" },
        },
      ]);
    if (url.pathname === `/repos/example/project/commits/${headSha}/check-runs`)
      return response({
        check_runs: [
          {
            app: { id: 15368 },
            conclusion: "success",
            head_sha: headSha,
            id: 10,
            name: "Bootstrap",
            status: "completed",
          },
          {
            app: { id: 15368 },
            conclusion: "success",
            head_sha: headSha,
            id: 11,
            name: "Sonar scanner",
            status: "completed",
          },
          {
            app: { id: 12526 },
            conclusion: "success",
            head_sha: headSha,
            id: 9,
            name: "SonarCloud Code Analysis",
            status: "completed",
          },
        ],
        total_count: 3,
      });
    if (url.pathname === "/graphql")
      return response({
        data: {
          repository: {
            pullRequest: {
              baseRefOid: baseSha,
              headRefOid: headSha,
              reviews: { totalCount: 1 },
              reviewThreads: {
                nodes: [],
                pageInfo: { endCursor: null, hasNextPage: false },
                totalCount: 0,
              },
            },
          },
        },
      });
    if (
      url.pathname === "/repos/example/project/check-runs" ||
      url.pathname === "/repos/example/project/check-runs/303"
    )
      return response(
        {
          app: { id: state.checkAppId },
          conclusion: body.conclusion ?? null,
          head_sha: state.checkHeadSha,
          id: 303,
          name: "Review approval gate",
          status: body.status,
        },
        body.status === "in_progress" ? 201 : state.completionStatus,
      );

    throw new Error("Unexpected synthetic request.");
  };
  const options = {
    appId: 101,
    expectedBaseSha: baseSha,
    expectedHeadSha: headSha,
    fetchImpl,
    inspect: async () => evidence(),
    installationId: 202,
    loadPrivateKey: async () => privateKey,
    now: () => clock,
    policy,
    pullNumber: 7,
  };
  return { calls, options, state };
};

const conclusions = (calls) =>
  calls
    .filter((call) => call.options.method === "PATCH")
    .map((call) => call.body.conclusion);

test("App JWT uses RS256, a backdated issue time and a short expiry", () => {
  const jwt = createGitHubAppJwt({ appId: 101, now: clock, privateKey });
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    exp: clock / 1000 + 540,
    iat: clock / 1000 - 60,
    iss: "101",
  });
  assert.equal(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("JWT rejects unsupported keys and invalid App/clock values without exposing key contents", () => {
  const { privateKey: ecKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
  const { privateKey: weakKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
  for (const key of ["synthetic-sensitive-invalid-key", ecKey, weakKey])
    assert.throws(
      () => createGitHubAppJwt({ appId: 101, now: clock, privateKey: key }),
      /^Error: GitHub App signing requires/,
    );

  for (const input of [
    { appId: 0, now: clock },
    { appId: 101, now: NaN },
  ])
    assert.throws(
      () => createGitHubAppJwt({ ...input, privateKey }),
      /valid GitHub App ID and clock/,
    );
});

test("publisher requests one repository with the exact narrow token permissions", async () => {
  const { calls, options } = fixture();
  const result = await publishReviewApproval(options);
  const tokenRequest = calls.find((call) =>
    call.url.pathname.endsWith("/access_tokens"),
  );
  assert.deepEqual(tokenRequest.body, {
    permissions: { checks: "write", contents: "read", pull_requests: "read" },
    repository_ids: [99],
  });
  assert.equal(result.passed, true);
  assert.equal(result.headSha, headSha);
  assert.equal(
    calls.find((call) => call.body?.status)?.body.status,
    "in_progress",
  );
  assert.deepEqual(conclusions(calls), ["success"]);
  assert.equal(
    JSON.stringify(result).includes("synthetic-installation-token"),
    false,
  );
  assert.equal(
    calls.filter((call) => call.options.method === "POST").length,
    2,
  );
});

test("check is in progress before evidence collection and collector receives only the installation token", async () => {
  const { calls, options } = fixture();
  options.inspect = async (inputs) => {
    assert.equal(calls.at(-1).body.status, "in_progress");
    assert.equal(inputs.token, "synthetic-installation-token");
    assert.equal(inputs.expectedHeadSha, headSha);
    assert.equal(inputs.repository, "example/project");
    assert.equal(Object.hasOwn(inputs, "apiUrl"), false);
    assert.equal(Object.hasOwn(inputs, "graphqlUrl"), false);
    return evidence();
  };
  assert.equal((await publishReviewApproval(options)).passed, true);
});

test("real read-only collector and publisher complete one synthetic approval cycle without credential crossover", async () => {
  const { calls, options } = fixture();
  delete options.inspect;
  const result = await publishReviewApproval(options);
  assert.equal(result.passed, true);
  assert.equal(
    calls.filter((call) => call.url.pathname === "/graphql").length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.url.pathname.endsWith("/pulls/7")).length,
    4,
  );
  for (const call of calls) {
    const jwtOnly = [
      "/app",
      "/repos/example/project/installation",
      "/app/installations/202/access_tokens",
    ].includes(call.url.pathname);
    const credential = call.options.headers.Authorization;
    if (jwtOnly) {
      const [header, payload, signature] = credential
        .slice("Bearer ".length)
        .split(".");
      assert.equal(
        verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          publicKey,
          Buffer.from(signature, "base64url"),
        ),
        true,
      );
    } else {
      assert.equal(credential, "Bearer synthetic-installation-token");
    }
  }
  assert.deepEqual(conclusions(calls), ["success"]);
});

test("wrong authenticated App or installation identity prevents any check publication", async () => {
  for (const change of [
    (state) => {
      state.app.id = 999;
    },
    (state) => {
      state.installation.app_id = 999;
    },
    (state) => {
      state.installation.id = 999;
    },
    (state) => {
      state.installation.account.login = "another-owner";
    },
    (state) => {
      state.installation.suspended_at = new Date(clock).toISOString();
    },
  ]) {
    const { calls, options, state } = fixture();
    change(state);
    await assert.rejects(
      publishReviewApproval(options),
      /identity|installation/,
    );
    assert.equal(
      calls.some((call) => call.url.pathname.includes("check-runs")),
      false,
    );
  }
});

test("overprivileged, expired and multi-repository tokens cannot create checks", async () => {
  for (const change of [
    (state) => {
      state.token.permissions.contents = "write";
    },
    (state) => {
      state.token.permissions.issues = "write";
    },
    (state) => {
      delete state.token.permissions.pull_requests;
    },
    (state) => {
      state.token.expires_at = new Date(clock - 1).toISOString();
    },
    (state) => {
      state.scope.total_count = 2;
      state.scope.repositories.push({ full_name: "example/other", id: 100 });
    },
    (state) => {
      state.scope.repositories[0].id = 100;
    },
    (state) => {
      state.scope.repositories[0].full_name = "someone/project";
    },
  ]) {
    const { calls, options, state } = fixture();
    change(state);
    await assert.rejects(publishReviewApproval(options), /token|repository/);
    assert.equal(
      calls.some((call) => call.url.pathname.includes("check-runs")),
      false,
    );
  }
});

test("missing, failing, stale or forged passing evidence publishes failure only", async () => {
  for (const change of [
    (value) => {
      value.passed = false;
    },
    (value) => {
      value.codeRabbit.state = "COMMENTED";
    },
    (value) => {
      value.codeRabbit.commitSha = "c".repeat(40);
    },
    (value) => {
      value.codeRabbit.userId = 999;
    },
    (value) => {
      value.sonar.appId = 15368;
    },
    (value) => {
      value.sonar.conclusion = "skipped";
    },
    (value) => {
      value.ci[0].status = "in_progress";
    },
    (value) => {
      value.ci = [value.ci[0], value.ci[0]];
    },
    (value) => {
      value.unresolvedThreads = ["thread-1"];
    },
    (value) => {
      value.baseSha = "c".repeat(40);
    },
    (value) => {
      value.headSha = "c".repeat(40);
    },
    (value) => {
      value.reasons = ["Missing evidence"];
    },
  ]) {
    const { calls, options } = fixture();
    const value = evidence();
    change(value);
    options.inspect = async () => value;
    assert.equal((await publishReviewApproval(options)).passed, false);
    assert.deepEqual(conclusions(calls), ["failure"]);
  }
});

test("collector failure is sanitized and cannot publish success", async () => {
  const { calls, options } = fixture();
  options.inspect = async () => {
    throw new Error("synthetic-sensitive-error");
  };
  const result = await publishReviewApproval(options);
  assert.equal(result.passed, false);
  assert.deepEqual(conclusions(calls), ["failure"]);
  assert.equal(
    JSON.stringify(calls.map((call) => call.body)).includes(
      "synthetic-sensitive-error",
    ),
    false,
  );
});

test("head/base changes before completion fail and changes immediately after publication revoke success", async () => {
  for (const index of [0, 1]) {
    const { calls, options, state } = fixture();
    state.pulls[index].base.sha = "c".repeat(40);
    assert.equal((await publishReviewApproval(options)).passed, false);
    assert.deepEqual(
      conclusions(calls),
      index === 0 ? ["failure"] : ["success", "failure"],
    );
  }
});

test("unexpected check App/head identity is rejected while the check is still pending", async () => {
  for (const change of [
    (state) => {
      state.checkAppId = 999;
    },
    (state) => {
      state.checkHeadSha = "c".repeat(40);
    },
  ]) {
    const { calls, options, state } = fixture();
    change(state);
    await assert.rejects(publishReviewApproval(options), /unexpected identity/);
    assert.deepEqual(conclusions(calls), []);
  }
});

test("unsafe collector URLs never receive any network request or credentials", async () => {
  for (const url of [
    "http://api.github.com/graphql",
    "https://attacker.invalid/graphql",
    "https://api.github.com.attacker.invalid/graphql",
    "https://user:password@api.github.com/graphql",
    "https://api.github.com/graphql#fragment",
  ]) {
    const { calls, options } = fixture();
    let blockedError;
    let before;
    options.inspect = async ({ fetchImpl, token }) => {
      before = calls.length;
      try {
        await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch (error) {
        blockedError = error;
      }
      throw new Error("Unsafe URL rejected.");
    };
    assert.equal((await publishReviewApproval(options)).passed, false);
    assert.match(blockedError?.message ?? "", /fixed GitHub HTTPS/);
    assert.equal(calls.length, before + 1);
    assert.deepEqual(conclusions(calls), ["failure"]);
  }
});

test("redirects and HTTP errors cannot advance to successful completion", async () => {
  for (const status of [302, 403, 500]) {
    const { calls, options } = fixture();
    const underlying = options.fetchImpl;
    options.fetchImpl = async (input, init) => {
      if (new URL(input).pathname === "/app") return response({}, status);
      return underlying(input, init);
    };
    await assert.rejects(publishReviewApproval(options), /request failed/);
    assert.deepEqual(conclusions(calls), []);
  }
});

test("failure to publish the final decision remains an error, never a successful result", async () => {
  const { calls, options, state } = fixture();
  state.completionStatus = 503;
  options.inspect = async () => ({ passed: false });
  await assert.rejects(
    publishReviewApproval(options),
    /successful final gate was not confirmed/,
  );
  assert.deepEqual(conclusions(calls), ["failure"]);
});

test("invalid policy/head inputs are rejected before loading a key or making requests", async () => {
  for (const change of [
    { expectedHeadSha: "main" },
    { expectedBaseSha: undefined },
    { appId: 0 },
    { policy: { ...policy, repository: "../project" } },
    { policy: { ...policy, requiredCiContexts: ["Review approval gate"] } },
  ]) {
    const { calls, options } = fixture();
    let keyReads = 0;
    await assert.rejects(
      publishReviewApproval({
        ...options,
        ...change,
        loadPrivateKey: async () => {
          keyReads++;
          return privateKey;
        },
      }),
      /inputs are required/,
    );
    assert.equal(keyReads, 0);
    assert.equal(calls.length, 0);
  }
});

test("operator inputs use explicit external paths and refuse execution in PR CI", () => {
  const env = {
    REVIEW_APP_ID: "101",
    REVIEW_APP_INSTALLATION_ID: "202",
    REVIEW_APP_PRIVATE_KEY_PATH: pathForFixtureKey(),
    REVIEW_BASE_SHA: baseSha,
    REVIEW_HEAD_SHA: headSha,
    REVIEW_PULL_NUMBER: "7",
  };
  const inputs = readPublisherInputs(env, policy);
  assert.equal(inputs.appId, 101);
  assert.equal(typeof inputs.loadPrivateKey, "function");
  for (const extra of [
    { GITHUB_ACTIONS: "true" },
    { GITHUB_EVENT_NAME: "pull_request_target" },
    { REVIEW_APP_PRIVATE_KEY_PATH: "relative.pem" },
  ])
    assert.throws(
      () => readPublisherInputs({ ...env, ...extra }, policy),
      /outside pull-request CI|absolute REVIEW_APP_PRIVATE_KEY_PATH/,
    );
});

function pathForFixtureKey() {
  return process.platform === "win32"
    ? "C:/synthetic/key-never-read.pem"
    : "/synthetic/key-never-read.pem";
}
