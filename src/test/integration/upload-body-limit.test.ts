import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Hono } from "hono";

import { getTranslator } from "../../infrastructure/localization/i18n.ts";
import type { AppLogger } from "../../infrastructure/logging/logger.ts";
import type { HttpDependencies } from "../../presentation/http/dependencies.ts";
import {
  ApiError,
  type AppEnvironment,
  respondToError,
} from "../../presentation/http/http.ts";
import { createFileRoutes } from "../../presentation/http/routes/files.ts";

const uploadLimit = 128;

const appForTest = (
  onUpload: (bytes: Uint8Array) => void,
  rejectAuth = false,
  language: "en" | "fa" = "fa",
) => {
  const logger = {
    child() {
      return this;
    },
    error() {},
    info() {},
  } as unknown as AppLogger;
  const dependencies = {
    config: {
      uploadLimitBytes: uploadLimit,
      storageDriver: "local",
      allowedOrigins: [],
    },
    services: {
      auth: {
        fromRequest: () => ({
          authenticate: async () => {
            if (rejectAuth) throw new ApiError(401, "invalidCredentials");
            return { account: { id: "user" }, permissions: [] };
          },
        }),
      },
      files: {
        upload: async ({
          source,
        }: {
          source: { read(): Promise<Uint8Array> };
        }) => {
          const bytes = await source.read();
          onUpload(bytes);
          return {
            id: "file",
            contentType: "text/plain",
            visibility: "public",
          };
        },
      },
    },
  } as unknown as HttpDependencies;
  const app = new Hono<AppEnvironment>();
  app.use("*", async (context, next) => {
    context.set("dependencies", dependencies);
    context.set("logger", logger);
    context.set("translate", getTranslator(language));
    await next();
  });
  app.route("/files", createFileRoutes());
  app.onError(respondToError);
  return app;
};

const streamRequest = (
  bytes: Uint8Array,
  type: string,
  contentLength?: string,
) => {
  let offset = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const next = Math.min(bytes.length, offset + 1024);
        controller.enqueue(bytes.subarray(offset, next));
        offset = next;
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://localhost/files", {
    method: "POST",
    headers: {
      "content-type": type,
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, state: () => ({ offset, canceled }) };
};

for (const declaredLength of [undefined, "999999"])
  test(`accepts a small streamed multipart upload with Content-Length ${declaredLength ?? "missing"}`, async () => {
    const form = new FormData();
    form.set("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    form.set("visibility", "public");
    const encoded = new Request("http://localhost", {
      method: "POST",
      body: form,
    });
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const { request } = streamRequest(
      bytes,
      encoded.headers.get("content-type")!,
      declaredLength,
    );
    let saved: Uint8Array | undefined;
    const response = await appForTest((value) => {
      saved = value;
    }).fetch(request);
    assert.equal(response.status, 201);
    assert.equal(Buffer.from(saved!).toString(), "hello");
  });

for (const declaredLength of [undefined, "1"]) {
  test(`rejects and cancels an oversized streamed upload with Content-Length ${declaredLength ?? "missing"}`, async () => {
    const bytes = new Uint8Array(200_000).fill(65);
    const { request, state } = streamRequest(
      bytes,
      "multipart/form-data; boundary=x",
      declaredLength,
    );
    let called = false;
    const response = await appForTest(() => {
      called = true;
    }).fetch(request);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      message: getTranslator("fa")("fileTooLarge"),
    });
    assert.equal(state().canceled, true);
    assert.ok(state().offset < bytes.length);
    assert.equal(called, false);
  });
}

const multipartAtSize = async (size: number) => {
  const create = (length: number) => {
    const form = new FormData();
    form.set("note", "a".repeat(length));
    form.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
    return new Request("http://localhost", { method: "POST", body: form });
  };
  const fixed = (await create(0).arrayBuffer()).byteLength;
  const encoded = create(size - fixed);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  assert.equal(bytes.length, size);
  return { bytes, type: encoded.headers.get("content-type")! };
};

test("accepts exactly the multipart byte budget", async () => {
  const maximum = uploadLimit + 64 * 1024;
  let uploaded: Uint8Array | undefined;
  const { bytes, type } = await multipartAtSize(maximum);
  const { request } = streamRequest(bytes, type);
  const response = await appForTest((bytes) => {
    uploaded = bytes;
  }).fetch(request);
  assert.equal(response.status, 201);
  assert.equal(Buffer.from(uploaded!).toString(), "x");
});

test("rejects exactly one byte above the multipart byte budget", async () => {
  const maximum = uploadLimit + 64 * 1024;
  let called = false;
  const { bytes, type } = await multipartAtSize(maximum + 1);
  const { request, state } = streamRequest(bytes, type);
  const response = await appForTest(() => {
    called = true;
  }).fetch(request);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    message: getTranslator("fa")("fileTooLarge"),
  });
  assert.equal(state().canceled, true);
  assert.equal(called, false);
});

test("rejects a huge non-file multipart field without invoking upload", async () => {
  const prefix = '--x\r\nContent-Disposition: form-data; name="note"\r\n\r\n';
  const bytes = new TextEncoder().encode(
    prefix + "x".repeat(200_000) + "\r\n--x--\r\n",
  );
  let called = false;
  const { request, state } = streamRequest(
    bytes,
    "multipart/form-data; boundary=x",
  );
  const response = await appForTest(() => {
    called = true;
  }).fetch(request);
  assert.equal(response.status, 413);
  assert.equal(state().canceled, true);
  assert.ok(state().offset < bytes.length);
  assert.equal(called, false);
});

test("does not read upload bytes before authentication succeeds", async () => {
  let called = false;
  const { request, state } = streamRequest(
    new Uint8Array(200_000),
    "multipart/form-data; boundary=x",
  );
  const response = await appForTest(() => {
    called = true;
  }, true).fetch(request);
  assert.equal(response.status, 401);
  assert.equal(state().offset, 0);
  assert.equal(called, false);
});

test("handles upload stream read errors without leaking internal details", async () => {
  const source = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.error(new Error("sensitive-stream-error"));
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://localhost/files", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: source,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  let called = false;
  const response = await appForTest(() => {
    called = true;
  }).fetch(request);
  assert.equal(response.status, 500);
  const result = await response.text();
  assert.ok(!result.includes("sensitive-stream-error"));
  assert.equal(called, false);
});

test("rejects unsupported media type with a localized 415", async () => {
  const { request } = streamRequest(
    new TextEncoder().encode("{}"),
    "application/json",
  );
  let called = false;
  const response = await appForTest(() => {
    called = true;
  }).fetch(request);
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    message: getTranslator("fa")("fieldInvalid", { field: "Content-Type" }),
  });
  assert.equal(called, false);
});

test("English unsupported media type matches the saved 415 example", async () => {
  const { request } = streamRequest(
    new TextEncoder().encode("{}"),
    "application/json",
  );
  let called = false;
  const response = await appForTest(
    () => {
      called = true;
    },
    false,
    "en",
  ).fetch(request);
  const expected = JSON.parse(
    await readFile(
      new URL("../../../collection/files/upload/415.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), expected);
  assert.equal(called, false);
});

for (const contentType of [
  "multipart/form-data",
  "multipart/form-data; boundary=x",
]) {
  test(`rejects malformed multipart content for ${contentType} with a localized 400`, async () => {
    const { request } = streamRequest(
      new TextEncoder().encode("invalid"),
      contentType,
    );
    let called = false;
    const response = await appForTest(() => {
      called = true;
    }).fetch(request);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      message: getTranslator("fa")("fieldInvalid", { field: "file" }),
    });
    assert.equal(called, false);
  });
}
