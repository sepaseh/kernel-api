import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { test } from "node:test";

import { checkHealth } from "./healthcheck.mjs";

test("readiness probes check actual response semantics and do not follow redirects", async () => {
  let successfulApiRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/api") {
      successfulApiRequests++;
      response.setHeader("content-type", "application/json");
      response.end('{"status":"ok"}');
    } else if (request.url === "/website") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><html><body>Ready</body></html>");
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "/api" });
      response.end();
    } else if (request.url === "/bad-json") {
      response.setHeader("content-type", "application/json");
      response.end('{"status":"starting"}');
    } else {
      response.writeHead(503);
      response.end("not ready");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await checkHealth("api", `${base}/api`);
    for (const [mode, target] of [
      ["api", "/bad-json"],
      ["website", "/api"],
      ["api", "/error"],
      ["api", "/redirect"],
    ]) {
      await assert.rejects(() => checkHealth(mode, base + target));
    }
    assert.equal(successfulApiRequests, 1);
    await assert.rejects(() => checkHealth("unknown", base));
    await assert.rejects(() => checkHealth("api", "file:///tmp/file"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
