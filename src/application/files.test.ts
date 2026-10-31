import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationError } from "./errors.ts";
import { createFilesService } from "./files.ts";
import type { Actor } from "./models.ts";
import type {
  FileEvents,
  FileRecord,
  FileRepository,
  FileUploadStage,
  UploadFileSource,
} from "./ports/files.ts";
import type { ObjectStorage } from "./ports/object-storage.ts";

const actor: Actor = {
  account: {
    authEmail: "fixture@kernel.local",
    firstName: "Fixture",
    id: "fixture-user",
    isSystemAdmin: false,
    lastName: "User",
    mobile: "09120000000",
    name: "Fixture User",
    status: "active",
  },
  permissions: [],
  session: {
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date("2099-01-01"),
    id: "fixture-session",
    token: "fixture-token",
    userId: "fixture-user",
  },
};
const source: UploadFileSource = {
  name: "a b / picture.png",
  read: async () => new Uint8Array([1, 2, 3]),
  size: 3,
  type: "image/png",
};

const fixture = () => {
  const records = new Map<string, FileRecord>();
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const repository: FileRepository = {
    findById: async (id) => records.get(id),
    insert: async (record) => {
      records.set(record.id, record);
    },
  };
  const storage: ObjectStorage = {
    delete: async (_bucket, key) => {
      deleted.push(key);
      objects.delete(key);
    },
    ensureReady: async () => {},
    get: async (_bucket, key) => {
      const value = objects.get(key);
      if (!value) throw new Error("Fixture object is missing");
      return value;
    },
    put: async ({ data, objectKey, visibility }) => {
      objects.set(objectKey, data);
      return { bucket: visibility, objectKey };
    },
    url: (_bucket, key, visibility) =>
      visibility === "public" ? `https://storage.example/${key}` : undefined,
  };
  const service = createFilesService({
    newId: () => "fixture-file",
    now: () => new Date("2026-01-02"),
    repository,
    storage,
    uploadLimitBytes: 10,
  });
  return { deleted, objects, records, repository, service, storage };
};

test("file validation and public permission reject before reading or writing objects", async () => {
  const { objects, records, service } = fixture();
  let reads = 0;
  const unreadSource = {
    ...source,
    read: async () => {
      reads++;
      return new Uint8Array();
    },
  };
  for (const [input, kind, key] of [
    [{ actor, visibility: "private" }, "invalid", "fieldRequired"],
    [
      { actor, source: unreadSource, visibility: "unexpected" },
      "invalid",
      "visibilityInvalid",
    ],
    [
      { actor, source: unreadSource, visibility: "public" },
      "forbidden",
      "publicUploadDenied",
    ],
    [
      { actor, source: { ...unreadSource, size: 0 }, visibility: "private" },
      "invalid",
      "fileEmpty",
    ],
    [
      { actor, source: { ...unreadSource, size: 11 }, visibility: "private" },
      "too-large",
      "fileTooLarge",
    ],
  ] as const) {
    await assert.rejects(
      service.upload(input),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.kind === kind &&
        error.key === key,
    );
  }
  assert.equal(reads, 0);
  assert.equal(objects.size, 0);
  assert.equal(records.size, 0);
});

test("public uploads use the injected ports and private records cannot be read publicly", async () => {
  const { records, service } = fixture();
  const stages: FileUploadStage[] = [];
  const result = await service.upload(
    {
      actor: { ...actor, permissions: ["settings.update"] },
      source,
      visibility: "public",
    },
    { stage: (stage) => stages.push(stage) },
  );
  assert.deepEqual(result, {
    contentType: "image/png",
    id: "fixture-file",
    url: "https://storage.example/fixture-file/a-b-picture.png",
    visibility: "public",
  });
  const record = records.get(result.id);
  assert.ok(record);
  assert.equal(record.createdBy, actor.account.id);
  assert.equal(record.createdAt.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(record.originalName, source.name);
  assert.deepEqual(stages, [
    "validation",
    "read",
    "storage",
    "metadata",
    "response",
  ]);
  assert.deepEqual(
    (await service.getPublicContent(result.id)).contents,
    new Uint8Array([1, 2, 3]),
  );
  records.set(record.id, { ...record, visibility: "private" });
  for (const id of [record.id, "missing-file"]) {
    await assert.rejects(
      service.getPublicContent(id),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.kind === "not-found" &&
        error.key === "fileNotFound",
    );
  }
});

test("ordinary authenticated uploads remain private with no public URL and retain defaults", async () => {
  const { records, service } = fixture();
  const result = await service.upload({
    actor,
    source: { ...source, name: "", type: "" },
    visibility: "private",
  });
  assert.equal(result.url, undefined);
  assert.equal(result.contentType, "application/octet-stream");
  assert.equal(records.get(result.id)?.originalName, "upload");
  assert.equal(records.get(result.id)?.objectKey, "fixture-file/upload");
});

test("metadata failure attempts object cleanup and remains the thrown error if cleanup fails", async () => {
  const { deleted, repository, service, storage } = fixture();
  const metadataError = new Error("Synthetic metadata failure");
  const cleanupError = new Error("Synthetic cleanup failure");
  repository.insert = async () => {
    throw metadataError;
  };
  storage.delete = async (_bucket, key) => {
    deleted.push(key);
    throw cleanupError;
  };
  const stages: FileUploadStage[] = [];
  const failedOperations: string[] = [];
  const cleanupErrors: unknown[] = [];
  let completed = false;
  await assert.rejects(
    service.upload(
      { actor, source, visibility: "private" },
      {
        cleanupFailed: ({ error }) => cleanupErrors.push(error),
        stage: (stage) => stages.push(stage),
        storageFailed: ({ operation }) => failedOperations.push(operation),
        uploaded: () => {
          completed = true;
        },
      },
    ),
    (error: unknown) => error === metadataError,
  );
  assert.deepEqual(deleted, ["fixture-file/a-b-picture.png"]);
  assert.deepEqual(failedOperations, ["delete"]);
  assert.deepEqual(cleanupErrors, [cleanupError]);
  assert.equal(stages.at(-1), "metadata");
  assert.equal(completed, false);
});

test("metadata rollback deletes the stored object and never emits upload success", async () => {
  const { deleted, objects, repository, service } = fixture();
  const failure = new Error("Synthetic metadata rollback");
  repository.insert = async () => {
    throw failure;
  };
  let uploaded = false;

  await assert.rejects(
    service.upload(
      { actor, source, visibility: "private" },
      {
        uploaded: () => {
          uploaded = true;
        },
      },
    ),
    (error) => error === failure,
  );
  assert.deepEqual(deleted, ["fixture-file/a-b-picture.png"]);
  assert.equal(objects.size, 0);
  assert.equal(uploaded, false);
});

test("actual empty or oversized data is rejected before any object or metadata write", async () => {
  for (const [size, key, kind] of [
    [0, "fileEmpty", "invalid"],
    [11, "fileTooLarge", "too-large"],
  ] as const) {
    const { objects, records, repository, service, storage } = fixture();
    let objectWrites = 0;
    let metadataWrites = 0;
    storage.put = async () => {
      objectWrites++;
      return { bucket: "private", objectKey: "unexpected" };
    };
    repository.insert = async () => {
      metadataWrites++;
    };

    await assert.rejects(
      service.upload({
        actor,
        source: { ...source, read: async () => new Uint8Array(size), size: 1 },
        visibility: "private",
      }),
      { key, kind },
    );
    assert.equal(objectWrites, 0);
    assert.equal(metadataWrites, 0);
    assert.equal(objects.size, 0);
    assert.equal(records.size, 0);
  }
});

test("metadata and upload diagnostics use actual bytes rather than the declared size", async () => {
  const { objects, records, service } = fixture();
  const data = new Uint8Array(new ArrayBuffer(12), 3, 5);
  const uploaded: Array<Parameters<NonNullable<FileEvents["uploaded"]>>[0]> =
    [];

  const result = await service.upload(
    {
      actor,
      source: { ...source, read: async () => data, size: 1 },
      visibility: "private",
    },
    {
      uploaded: (event) => {
        uploaded.push(event);
      },
    },
  );
  assert.equal(records.get(result.id)?.size, 5);
  assert.equal(objects.get("fixture-file/a-b-picture.png")?.byteLength, 5);
  assert.deepEqual(uploaded, [
    {
      contentType: source.type,
      fileId: result.id,
      sizeBytes: 5,
      visibility: "private",
    },
  ]);
});

test("stage observer exceptions cannot interrupt file validation or a successful upload", async () => {
  for (const failedStage of [
    "validation",
    "read",
    "storage",
    "metadata",
    "response",
  ]) {
    const { objects, records, service } = fixture();
    const stages: FileUploadStage[] = [];
    let completed = false;

    const result = await service.upload(
      { actor, source, visibility: "private" },
      {
        stage: (stage) => {
          stages.push(stage);
          if (stage === failedStage)
            throw new Error("Synthetic stage observer failure");
        },
        uploaded: () => {
          completed = true;
        },
      },
    );
    assert.equal(result.visibility, "private");
    assert.equal(result.url, undefined);
    assert.equal(records.has(result.id), true);
    assert.equal(objects.size, 1);
    assert.equal(completed, true);
    assert.deepEqual(stages, [
      "validation",
      "read",
      "storage",
      "metadata",
      "response",
    ]);
  }
});

test("upload completion observer exceptions cannot turn committed private uploads into failures", async () => {
  const { objects, records, service } = fixture();

  const result = await service.upload(
    { actor, source, visibility: "private" },
    {
      uploaded: () => {
        throw new Error("Synthetic completion observer failure");
      },
    },
  );
  assert.equal(result.url, undefined);
  assert.equal(records.get(result.id)?.visibility, "private");
  assert.equal(objects.size, 1);
});

test("storage failure observers cannot mask a failed object write or create metadata", async () => {
  const { objects, records, service, storage } = fixture();
  const failure = new Error("Synthetic storage write failure");
  storage.put = async () => {
    throw failure;
  };
  const failures: string[] = [];

  await assert.rejects(
    service.upload(
      { actor, source, visibility: "private" },
      {
        storageFailed: ({ operation }) => {
          failures.push(operation);
          throw new Error("Synthetic storage observer failure");
        },
      },
    ),
    (error) => error === failure,
  );
  assert.deepEqual(failures, ["put"]);
  assert.equal(objects.size, 0);
  assert.equal(records.size, 0);
});

test("public reads preserve their storage error when its diagnostic observer throws", async () => {
  const { service, storage } = fixture();
  const result = await service.upload({
    actor: { ...actor, permissions: ["settings.update"] },
    source,
    visibility: "public",
  });
  const failure = new Error("Synthetic storage read failure");
  storage.get = async () => {
    throw failure;
  };
  const failures: string[] = [];

  await assert.rejects(
    service.getPublicContent(result.id, {
      storageFailed: ({ operation }) => {
        failures.push(operation);
        throw new Error("Synthetic storage observer failure");
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(failures, ["get"]);
});

test("metadata failure still cleans up after a stage observer throws", async () => {
  const { deleted, objects, repository, service } = fixture();
  const failure = new Error("Synthetic metadata failure");
  repository.insert = async () => {
    throw failure;
  };

  await assert.rejects(
    service.upload(
      { actor, source, visibility: "private" },
      {
        stage: (stage) => {
          if (stage === "metadata")
            throw new Error("Synthetic stage observer failure");
        },
      },
    ),
    (error) => error === failure,
  );
  assert.deepEqual(deleted, ["fixture-file/a-b-picture.png"]);
  assert.equal(objects.size, 0);
});

test("failed cleanup observers preserve the original metadata failure", async () => {
  const { deleted, repository, service, storage } = fixture();
  const metadataFailure = new Error("Synthetic metadata failure");
  const cleanupFailure = new Error("Synthetic object deletion failure");
  repository.insert = async () => {
    throw metadataFailure;
  };
  storage.delete = async (_bucket, key) => {
    deleted.push(key);
    throw cleanupFailure;
  };
  const events: string[] = [];

  await assert.rejects(
    service.upload(
      { actor, source, visibility: "private" },
      {
        cleanupFailed: ({ error, fileId }) => {
          assert.equal(error, cleanupFailure);
          assert.equal(fileId, "fixture-file");
          events.push("cleanup");
          throw new Error("Synthetic cleanup observer failure");
        },
        storageFailed: ({ operation }) => {
          events.push(operation);
          throw new Error("Synthetic storage observer failure");
        },
      },
    ),
    (error) => error === metadataFailure,
  );
  assert.deepEqual(deleted, ["fixture-file/a-b-picture.png"]);
  assert.deepEqual(events, ["delete", "cleanup"]);
});
