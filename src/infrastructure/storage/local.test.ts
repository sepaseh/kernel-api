import assert from "node:assert/strict";
import fsPromises, { mkdtemp, readFile, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";

import { createLogger } from "../logging/logger.ts";
import { LocalFileStorage } from "./local.ts";
import { withStorageLogging } from "./operations.ts";

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

const injectStorageFailures = (
  context: TestContext,
  failures: { write?: Error; close?: Error; cleanup?: Error },
) => {
  const originalOpen = fsPromises.open;
  const originalUnlink = fsPromises.unlink;
  const remove = context.mock.method(
    fsPromises,
    "unlink",
    async (target: Parameters<typeof fsPromises.unlink>[0]) => {
      if (failures.cleanup) throw failures.cleanup;
      await originalUnlink(target);
    },
  );
  context.mock.method(
    fsPromises,
    "open",
    async (...args: Parameters<typeof fsPromises.open>) => {
      const handle = await originalOpen(...args);
      if (failures.write) {
        const write = handle.writeFile.bind(handle);
        context.mock.method(handle, "writeFile", async (data: Uint8Array) => {
          await write(data.subarray(0, 2));
          throw failures.write;
        });
      }
      if (failures.close) {
        const close = handle.close.bind(handle);
        context.mock.method(handle, "close", async () => {
          await close();
          throw failures.close;
        });
      }
      return handle;
    },
  );
  const restore = () => {
    context.mock.restoreAll();
    syncBuiltinESMExports();
  };
  context.after(restore);
  syncBuiltinESMExports();
  return { remove, restore };
};

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

test("a partial failed write is removed and the same object key can be retried", async (context) => {
  const { storage } = await fixture(context);
  const failure = new Error("synthetic-partial-write");
  const { restore } = injectStorageFailures(context, { write: failure });
  const input = upload("private");
  await assert.rejects(storage.put(input), (error) => error === failure);
  await assert.rejects(storage.get("local-private", input.objectKey), {
    code: "ENOENT",
  });
  restore();
  const stored = await storage.put(input);
  assert.deepEqual(
    new Uint8Array(await storage.get(stored.bucket, stored.objectKey)),
    input.data,
  );
});

test("exclusive creation failure never attempts to remove a pre-existing object", async (context) => {
  const { storage } = await fixture(context);
  const input = upload("public");
  const stored = await storage.put(input);
  const { remove } = injectStorageFailures(context, {});
  await assert.rejects(storage.put(input), { code: "EEXIST" });
  assert.equal(remove.mock.callCount(), 0);
  assert.deepEqual(
    new Uint8Array(await storage.get(stored.bucket, stored.objectKey)),
    input.data,
  );
});

test("a cleanup failure preserves the original write error and the partial bytes", async (context) => {
  const { storage } = await fixture(context);
  const failure = new Error("synthetic-partial-write");
  injectStorageFailures(context, {
    write: failure,
    cleanup: new Error("synthetic-unlink-failure"),
  });
  const input = upload("private");
  await assert.rejects(storage.put(input), (error) => error === failure);
  assert.deepEqual(
    new Uint8Array(await storage.get("local-private", input.objectKey)),
    input.data.subarray(0, 2),
  );
});

test("a close failure during cleanup cannot replace the original write error", async (context) => {
  const { storage } = await fixture(context);
  const failure = new Error("synthetic-partial-write");
  injectStorageFailures(context, {
    write: failure,
    close: new Error("synthetic-close-failure"),
  });
  const input = upload("private");
  await assert.rejects(storage.put(input), (error) => error === failure);
  await assert.rejects(storage.get("local-private", input.objectKey), {
    code: "ENOENT",
  });
});

test("a failed final close removes this call's object and preserves the close error", async (context) => {
  const { storage } = await fixture(context);
  const failure = new Error("synthetic-close-failure");
  injectStorageFailures(context, { close: failure });
  const input = upload("public");
  await assert.rejects(storage.put(input), (error) => error === failure);
  await assert.rejects(storage.get("local-public", input.objectKey), {
    code: "ENOENT",
  });
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
