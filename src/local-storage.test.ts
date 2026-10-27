import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";

import { createLogger } from "./infrastructure/logging/logger.ts";
import { LocalFileStorage } from "./infrastructure/storage/local.ts";
import { withStorageLogging } from "./infrastructure/storage/operations.ts";

const fixture = async (context: TestContext) => {
  const parent = path.resolve(os.tmpdir());
  const root = await mkdtemp(path.join(parent, "kernel-local-storage-test-"));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("kernel-local-storage-test-"));
    await rm(root, { force: true, recursive: true });
  });
  return {
    root,
    storage: new LocalFileStorage({
      baseUrl: "https://api.example.test/",
      localStoragePath: path.join(root, "objects"),
    }),
  };
};

const upload = (
  visibility: "private" | "public",
  objectKey = "file-id/data.bin",
) => ({
  contentType: "application/octet-stream",
  data: new Uint8Array([0, 1, 127, 255]),
  objectKey,
  visibility,
});

test("local storage prepares isolated buckets repeatedly and persists exact bytes", async (context) => {
  const { root, storage } = await fixture(context);
  await storage.ensureReady();
  await storage.ensureReady();
  for (const visibility of ["private", "public"] as const) {
    const input = upload(visibility);
    const stored = await storage.put(input);
    assert.deepEqual(stored, {
      bucket: `local-${visibility}`,
      objectKey: input.objectKey,
    });
    assert.deepEqual(
      new Uint8Array(await storage.get(stored.bucket, stored.objectKey)),
      input.data,
    );
    assert.deepEqual(
      new Uint8Array(
        await readFile(
          path.join(root, "objects", stored.bucket, stored.objectKey),
        ),
      ),
      input.data,
    );
    await storage.delete(stored.bucket, stored.objectKey);
    await assert.rejects(storage.get(stored.bucket, stored.objectKey), {
      code: "ENOENT",
    });
  }
});

test("put creates missing directories and exclusive creation never overwrites an object", async (context) => {
  const { storage } = await fixture(context);
  const original = upload("private", "file/nested/نام فایل.bin");
  const stored = await storage.put(original);
  await assert.rejects(
    storage.put({ ...original, data: new Uint8Array([99]) }),
    { code: "EEXIST" },
  );
  assert.deepEqual(
    new Uint8Array(await storage.get(stored.bucket, stored.objectKey)),
    original.data,
  );
  const empty = await storage.put({
    ...upload("public", "empty/file"),
    data: new Uint8Array(),
  });
  assert.equal(
    (await storage.get(empty.bucket, empty.objectKey)).byteLength,
    0,
  );
});

test("missing reads and deletes expose a failure rather than a fabricated success", async (context) => {
  const { storage } = await fixture(context);
  await storage.ensureReady();
  for (const bucket of ["local-private", "local-public"]) {
    await assert.rejects(storage.get(bucket, "missing/object"), {
      code: "ENOENT",
    });
    await assert.rejects(storage.delete(bucket, "missing/object"), {
      code: "ENOENT",
    });
  }
});

test("local reads and deletes reject unknown buckets before filesystem access", async (context) => {
  const { storage } = await fixture(context);
  for (const bucket of [
    "",
    "../outside",
    "local-public/../local-private",
    "other",
  ]) {
    await assert.rejects(
      storage.get(bucket, "file/data"),
      /Invalid local storage bucket/,
    );
    await assert.rejects(
      storage.delete(bucket, "file/data"),
      /Invalid local storage bucket/,
    );
  }
});

test("object operations reject escaping, absolute and Windows-shaped keys", async (context) => {
  const { root, storage } = await fixture(context);
  const invalid = [
    "",
    ".",
    "..",
    "../outside",
    "nested/../../outside",
    path.join(root, "outside"),
    "C:\\outside\\object",
    "C:/outside/object",
    "\\\\server\\share\\object",
    "nested\\..\\outside",
    "\\outside",
  ];
  for (const objectKey of invalid) {
    await assert.rejects(
      storage.put(upload("public", objectKey)),
      /Invalid local storage object key/,
    );
    await assert.rejects(
      storage.get("local-public", objectKey),
      /Invalid local storage object key/,
    );
    await assert.rejects(
      storage.delete("local-public", objectKey),
      /Invalid local storage object key/,
    );
  }
});

test("public links target the API content route and private objects have no link", async (context) => {
  const { storage } = await fixture(context);
  assert.equal(storage.url("local-private", "id/file", "private"), undefined);
  assert.equal(
    storage.url("local-public", "file id?#/data.bin", "public"),
    "https://api.example.test/files/file%20id%3F%23/content",
  );
  assert.equal(storage.url("local-public", "", "public"), undefined);
  assert.equal(storage.url("local-public", "id/file", "unknown"), undefined);
});

const capturedLogger = () => {
  const lines: string[] = [];
  const logger = createLogger(
    {
      environment: "test",
      level: "debug",
      pretty: false,
      release: "synthetic-storage-test",
    },
    { write: (line) => lines.push(line) },
  );
  return { lines, logger };
};

test("storage logging returns successful values without emitting an error", async () => {
  const { lines, logger } = capturedLogger();
  const expected = { bucket: "local-public", objectKey: "file/data" };
  assert.equal(
    await withStorageLogging(logger, "local", "put", async () => expected),
    expected,
  );
  assert.deepEqual(lines, []);
});

test("storage logging preserves failure identity and logs only safe operation metadata", async () => {
  for (const driver of ["local", "minio"] as const) {
    for (const operation of ["delete", "ensureReady", "get", "put"] as const) {
      const { lines, logger } = capturedLogger();
      const failure = new Error(
        "private-storage-path password=synthetic-secret",
      );
      await assert.rejects(
        withStorageLogging(logger, driver, operation, async () => {
          throw failure;
        }),
        (error) => error === failure,
      );
      assert.equal(lines.length, 1);
      const record = JSON.parse(lines[0]);
      assert.equal(record.event, "storage.operation.failed");
      assert.equal(record.operation, operation);
      assert.equal(record.storageDriver, driver);
      assert.equal(record.msg, "Storage operation failed");
      assert.equal(record.level, 50);
      assert.equal(Object.hasOwn(record, "err"), false);
      assert.doesNotMatch(
        lines[0],
        /private-storage-path|synthetic-secret|password/,
      );
    }
  }
});

test("a failed logging destination cannot replace the storage error", async () => {
  const failure = new Error("synthetic-storage-failure");
  const logger = {
    ...capturedLogger().logger,
    error() {
      throw new Error("synthetic-log-failure");
    },
  };
  await assert.rejects(
    withStorageLogging(logger, "local", "get", async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
});
