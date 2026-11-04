import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";

import { Hono } from "hono";

import { readBoundedMultipart } from "../src/presentation/http/routes/files.ts";

test("chunked upload receives HTTP 413 from a loopback Node bridge", async () => {
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
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let client;
  let clientClosed;
  const chunk = Buffer.alloc(1024, 65);
  // Keep the upload open and let socket demand govern production until 413.
  const upload = new Readable({
    read() {
      this.push(chunk);
    },
  });
  const uploadClosed = new Promise((resolve) => upload.once("close", resolve));
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
          upload.unpipe(client);
          upload.destroy();
          let body = "";
          response.once("error", reject);
          response.once("close", () => {
            if (!response.complete)
              reject(
                new Error(
                  "Upload rejection response closed before completion.",
                ),
              );
          });
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({ status: response.statusCode, body }),
          );
        },
      );
      clientClosed = new Promise((resolve) => client.once("close", resolve));
      client.on("error", reject);
      upload.on("error", reject);
      upload.pipe(client, { end: false });
    });
    assert.deepEqual(result, { status: 413, body: "rejected" });
    assert.equal(client.writableEnded, false);
    assert.equal(upload.readableEnded, false);
  } finally {
    upload.unpipe(client);
    upload.destroy();
    await uploadClosed;
    client?.destroy();
    await clientClosed;
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((failure) => (failure ? reject(failure) : resolve())),
    );
  }
});
