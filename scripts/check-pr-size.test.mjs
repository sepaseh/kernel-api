import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateFiles, inspectPullRequest } from "./check-pr-size.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const files = (count) =>
  Array.from({ length: count }, (_, index) => ({
    filename: `src/file-${index}.ts`,
    status: "added",
  }));
const pull = (changedFiles, overrides = {}) => ({
  base: { sha: base },
  changed_files: changedFiles,
  head: { sha: head },
  ...overrides,
});
const response = (data, link) =>
  new Response(JSON.stringify(data), {
    headers: link ? { link } : {},
    status: 200,
  });
const inspect = (fetchImpl, overrides = {}) =>
  inspectPullRequest({
    expectedHeadSha: head,
    fetchImpl,
    pullNumber: 1,
    repository: "example/api",
    ...overrides,
  });

test("accepts 99 and 100 changed files and rejects 101 without exclusions", () => {
  assert.equal(evaluateFiles(files(99), 99).changedFiles, 99);
  assert.equal(evaluateFiles(files(100), 100).changedFiles, 100);
  assert.throws(() => evaluateFiles(files(101), 101), /maximum is 100/);
});

test("counts removed, renamed and binary files as GitHub file entries", () => {
  const result = evaluateFiles(
    [
      { filename: "removed.ts", status: "removed" },
      {
        filename: "renamed.ts",
        previous_filename: "old.ts",
        status: "renamed",
      },
      { filename: "image.png", status: "modified" },
    ],
    3,
  );
  assert.equal(result.changedFiles, 3);
  assert.deepEqual(result.statusCounts, {
    modified: 1,
    removed: 1,
    renamed: 1,
  });
});

test("rejects duplicate, incomplete, malformed and unknown file results", () => {
  assert.throws(() => evaluateFiles(files(2), 3), /incomplete/);
  assert.throws(
    () => evaluateFiles([files(1)[0], files(1)[0]], 2),
    /duplicate/,
  );
  assert.throws(() => evaluateFiles(null, 0), /invalid/);
  for (const file of [
    {},
    { filename: "x", status: "invented" },
    { filename: "x", status: "renamed" },
  ])
    assert.throws(() => evaluateFiles([file], 1), /incomplete/);
});

test("follows all pagination links and checks the same head and count afterward", async () => {
  const requests = [];
  const fixture = files(100);
  const result = await inspect(async (url, options) => {
    requests.push({ url, options });
    if (!url.includes("/files")) return response(pull(100));
    if (url.includes("page=2")) return response(fixture.slice(60));
    return response(
      fixture.slice(0, 60),
      '<https://api.github.com/repos/example/api/pulls/1/files?per_page=100&page=2>; rel="next"',
    );
  });
  assert.equal(result.changedFiles, 100);
  assert.equal(requests.length, 4);
  assert.equal(requests[1].options.redirect, "error");
});

test("selects the next page from a multi-link header without following other relations", async () => {
  const fixture = files(2);
  const requests = [];
  const endpoint = "https://api.github.com/repos/example/api/pulls/1/files";
  const result = await inspect(async (url) => {
    requests.push(url);
    if (!url.includes("/files")) return response(pull(2));
    if (url.includes("page=2")) return response(fixture.slice(1));
    return response(
      fixture.slice(0, 1),
      [
        `<${endpoint}?page=1>; rel="first"`,
        `<${endpoint}?page=2>; rel="next"`,
        `<${endpoint}?page=3>; rel="last"`,
      ].join(", "),
    );
  });
  assert.equal(result.changedFiles, 2);
  assert.equal(requests.length, 4);
  assert.equal(requests[2], `${endpoint}?page=2`);
});

test("rejects incomplete results with long malformed or embedded pagination links", async () => {
  const validLink =
    '<https://api.github.com/repos/example/api/pulls/1/files?page=2>; rel="next"';
  for (const header of [
    "<".repeat(200_000),
    `unexpected-prefix${validLink}`,
    `${validLink}unexpected-suffix`,
  ]) {
    let requests = 0;
    await assert.rejects(
      inspect(async (url) => {
        requests++;
        if (!url.includes("/files")) return response(pull(2));
        if (url.includes("page=2")) return response(files(2).slice(1));
        return response(files(1), header);
      }),
      /incomplete/,
    );
    assert.equal(requests, 3);
  }
});

test("rejects ambiguous next-page links before requesting either target", async () => {
  let requests = 0;
  await assert.rejects(
    inspect(async (url) => {
      requests++;
      return url.includes("/files")
        ? response(
            files(1),
            '<https://api.github.com/repos/example/api/pulls/1/files?page=2>; rel="next", <https://api.github.com/repos/example/api/pulls/1/files?page=3>; rel="next"',
          )
        : response(pull(2));
    }),
    /ambiguous/,
  );
  assert.equal(requests, 2);
});

test("rejects an over-limit result spread across pages", async () => {
  const fixture = files(101);
  await assert.rejects(
    inspect(async (url) => {
      if (!url.includes("/files")) return response(pull(101));
      if (url.includes("page=2")) return response(fixture.slice(100));
      return response(
        fixture.slice(0, 100),
        '<https://api.github.com/repos/example/api/pulls/1/files?per_page=100&page=2>; rel="next"',
      );
    }),
    /maximum is 100/,
  );
});

test("fails closed for missing pages and a head or base changed during enumeration", async () => {
  await assert.rejects(
    inspect(async (url) =>
      response(url.includes("/files") ? files(1) : pull(2)),
    ),
    /incomplete/,
  );
  for (const field of ["head", "base"]) {
    let reads = 0;
    await assert.rejects(
      inspect(async (url) => {
        if (url.includes("/files")) return response(files(1));
        reads++;
        return response(
          pull(1, reads === 2 ? { [field]: { sha: "c".repeat(40) } } : {}),
        );
      }),
      /PR changed/,
    );
  }
});

test("never sends authorization to an off-host or off-endpoint pagination URL", async () => {
  for (const next of [
    "https://untrusted.example/files",
    "https://api.github.com/repos/other/api/pulls/1/files",
    "https://user:pass@api.github.com/repos/example/api/pulls/1/files",
  ]) {
    let requests = 0;
    await assert.rejects(
      inspect(
        async (url) => {
          requests++;
          return url.includes("/files")
            ? response(files(1), `<${next}>; rel="next"`)
            : response(pull(1));
        },
        { token: "synthetic-token" },
      ),
      /unsafe/,
    );
    assert.equal(requests, 2);
  }
});

test("rejects repeated pagination and invalid HTTP or metadata responses", async () => {
  await assert.rejects(
    inspect(async (url) =>
      url.includes("/files")
        ? response(files(1), `<${url}>; rel="next"`)
        : response(pull(1)),
    ),
    /unsafe/,
  );
  await assert.rejects(
    inspect(async () => new Response("unavailable", { status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    inspect(async () => response({})),
    /incomplete/,
  );
  await assert.rejects(
    inspect(async () => response(pull(1, { head: { sha: "c".repeat(40) } }))),
    /older PR head/,
  );
});

test("stops pagination before fetching a thirty-first page", async () => {
  const requestedPages = [];
  await assert.rejects(
    inspect(async (url) => {
      if (!url.includes("/files")) return response(pull(0));
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      requestedPages.push(page);
      return response(
        [],
        `<https://api.github.com/repos/example/api/pulls/1/files?page=${page + 1}>; rel="next"`,
      );
    }),
    /unsafe or incomplete/,
  );
  assert.deepEqual(
    requestedPages,
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
});

test("validates its target before making requests", async () => {
  let requests = 0;
  const fetchImpl = () => {
    requests++;
    throw new Error("No request should be made");
  };
  for (const options of [
    { repository: "../private/repo" },
    { repository: "../.." },
    { pullNumber: 0 },
    { expectedHeadSha: undefined },
    { apiUrl: "http://api.github.com" },
  ]) {
    await assert.rejects(
      inspect(fetchImpl, options),
      options.apiUrl ? /HTTPS/ : /required/,
    );
    assert.equal(requests, 0);
  }
});
