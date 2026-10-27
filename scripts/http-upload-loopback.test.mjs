import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";

import { Hono } from "hono";

import { readBoundedMultipart } from "../src/presentation/http/routes/files.ts";

test(
  "chunked upload receives HTTP 413 from a loopback Node bridge",
  { timeout: 5000 },
  async () => {
    const app = new Hono();
    app.post("/", async (context) => {
      await readBoundedMultipart(context.req.raw, 128);
      return context.text("unexpected", 200);
    });
    app.onError((error, context) =>
      context.text("rejected", error.status ?? 500),
    );

    const server = http.createServer(async (incoming, outgoing) => {
      try {
        const request = new Request("http://127.0.0.1/", {
          method: incoming.method,
          headers: incoming.headers,
          body: Readable.toWeb(incoming),
          duplex: "half",
        });
        const response = await app.fetch(request);
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers),
        );
        outgoing.end(await response.text());
      } catch {
        if (!outgoing.headersSent) outgoing.writeHead(500);
        outgoing.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    let client;
    let timer;
    try {
      const result = await new Promise((resolve, reject) => {
        client = http.request(
          {
            host: "127.0.0.1",
            port: server.address().port,
            method: "POST",
            headers: {
              "Content-Type": "multipart/form-data; boundary=x",
              "Transfer-Encoding": "chunked",
            },
          },
          (response) => {
            let body = "";
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.on("end", () =>
              resolve({ status: response.statusCode, body }),
            );
          },
        );
        client.on("error", reject);
        const chunk = Buffer.alloc(1024, 65);
        let sent = 0;
        timer = setInterval(() => {
          if (client.destroyed || sent++ > 150) {
            clearInterval(timer);
            if (!client.destroyed) client.end();
            return;
          }
          client.write(chunk);
        }, 1);
      });
      assert.deepEqual(result, { status: 413, body: "rejected" });
    } finally {
      clearInterval(timer);
      client?.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
