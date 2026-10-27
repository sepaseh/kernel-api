import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import fsPromises, { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http, { createServer } from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, mock, test, type TestContext } from "node:test";

const parent = path.resolve(os.tmpdir());
const owned = await mkdtemp(path.join(parent, "kernel-s3-sdk-test-"));
const profileFiles = [
  path.join(owned, "config"),
  path.join(owned, "credentials"),
];
await Promise.all(profileFiles.map((file) => writeFile(file, "")));
for (const name of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ENDPOINT_URL",
  "AWS_ENDPOINT_URL_S3",
])
  delete process.env[name];
process.env.AWS_CONFIG_FILE = profileFiles[0];
process.env.AWS_SHARED_CREDENTIALS_FILE = profileFiles[1];
process.env.AWS_EC2_METADATA_DISABLED = "true";
process.env.AWS_PROFILE = "kernel-synthetic-fixture";

let blockedProfiles = 0;
const profileRead = (file: unknown) => {
  if (typeof file !== "string") return;
  const resolved = path.resolve(file);
  if (
    (/[\\/]\.aws[\\/]/i.test(resolved) ||
      ["config", "credentials"].includes(path.basename(resolved))) &&
    !profileFiles.includes(resolved)
  ) {
    blockedProfiles++;
    throw new Error("SDK tests prohibit reading non-fixture AWS profiles.");
  }
};
const originalRead = fsPromises.readFile;
mock.method(
  fsPromises,
  "readFile",
  (...args: Parameters<typeof fsPromises.readFile>) => {
    profileRead(args[0]);
    return originalRead(...args);
  },
);
const originalReadSync = fs.readFileSync;
mock.method(
  fs,
  "readFileSync",
  (...args: Parameters<typeof fs.readFileSync>) => {
    profileRead(args[0]);
    return originalReadSync(...args);
  },
);

const endpoints = new Set<string>();
const transportErrors: Error[] = [];
let blockedNetwork = 0;
const guardedRequest =
  (original: typeof http.request, protocol: string) =>
  (...args: unknown[]) => {
    const value = args[0];
    const options =
      typeof value === "string" || value instanceof URL
        ? new URL(value)
        : (value as http.RequestOptions);
    const hostname =
      options.hostname ?? ("host" in options ? options.host : undefined);
    const port = options.port ?? (protocol === "https:" ? 443 : 80);
    const target = `${protocol}//${hostname}:${port}`;
    if (!endpoints.has(target)) {
      blockedNetwork++;
      throw new Error("SDK tests prohibit non-fixture network requests.");
    }
    const request = Reflect.apply(original, http, args) as http.ClientRequest;
    request.on("response", (response) =>
      response.on("error", (error: Error) => transportErrors.push(error)),
    );
    return request;
  };
mock.method(http, "request", guardedRequest(http.request, "http:"));
mock.method(https, "request", guardedRequest(https.request, "https:"));
syncBuiltinESMExports();

const { createObjectStorage } =
  await import("./infrastructure/storage/create.ts");
const { LocalFileStorage } = await import("./infrastructure/storage/local.ts");
const { MinioObjectStorage } =
  await import("./infrastructure/storage/minio.ts");
const { publicObjectUrl } = await import("./infrastructure/storage/url.ts");
const { loadConfig } = await import("./infrastructure/config.ts");
const { S3ServiceException } = await import("@aws-sdk/client-s3");
const { createLogger } = await import("./infrastructure/logging/logger.ts");
const { withStorageLogging } =
  await import("./infrastructure/storage/operations.ts");

after(async () => {
  mock.restoreAll();
  syncBuiltinESMExports();
  assert.equal(path.dirname(path.resolve(owned)), parent);
  assert.ok(path.basename(owned).startsWith("kernel-s3-sdk-test-"));
  await rm(owned, { recursive: true, force: true });
  assert.equal(
    blockedProfiles,
    1,
    "Only the explicit blocked-profile control may be attempted",
  );
  assert.equal(
    blockedNetwork,
    1,
    "Only the explicit blocked-network control may be attempted",
  );
});

const accessKey = "fixture-access-key";
const secretKey = "fixture-secret-key-for-signed-loopback-requests";
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Uint8Array, value: string) =>
  createHmac("sha256", key).update(value).digest();
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const verifySignature = (request: http.IncomingMessage, body: Buffer) => {
  const authorization = request.headers.authorization ?? "";
  const parsed =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)$/.exec(
      authorization,
    );
  assert.ok(parsed, "The fixture requires a signed SigV4 request");
  assert.equal(
    parsed[1] === accessKey,
    true,
    "Only explicitly supplied fixture credentials are permitted",
  );
  const scope = parsed[2];
  const signed = parsed[3].split(";");
  const date = String(request.headers["x-amz-date"]);
  const payload = String(request.headers["x-amz-content-sha256"]);
  if (payload !== "UNSIGNED-PAYLOAD") assert.equal(payload, hash(body));
  const url = new URL(request.url ?? "/", "http://fixture.invalid");
  const query = [...url.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort((left, right) =>
      left[0] < right[0]
        ? -1
        : left[0] > right[0]
          ? 1
          : left[1].localeCompare(right[1]),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonicalHeaders = signed
    .map(
      (name) =>
        `${name}:${String(request.headers[name]).trim().replace(/\s+/g, " ")}`,
    )
    .join("\n");
  const canonical = [
    request.method,
    url.pathname,
    query,
    `${canonicalHeaders}\n`,
    parsed[3],
    payload,
  ].join("\n");
  const [day, region, service, terminal] = scope.split("/");
  assert.equal(service, "s3");
  assert.equal(terminal, "aws4_request");
  const signing = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service),
    terminal,
  );
  const expected = hmac(
    signing,
    `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`,
  ).toString("hex");
  assert.equal(
    parsed[4] === expected,
    true,
    "The SDK signature must match the actual method, path, headers and bytes",
  );
  return region;
};

type Recorded = {
  operation: string;
  bucket: string;
  key: string;
  body: Buffer;
  headers: http.IncomingHttpHeaders;
  region: string;
};
type Bucket = {
  versioning?: string;
  policy?: unknown;
  objects: Map<string, Buffer>;
};
const fixture = async (context: TestContext) => {
  const buckets = new Map<string, Bucket>();
  const records: Recorded[] = [];
  const failures: string[] = [];
  const state: {
    fault?: string;
    truncate?: boolean;
    redirectRegion?: string;
    message?: string;
    location?: string;
  } = {};
  const error = (
    response: http.ServerResponse,
    status: number,
    code: string,
  ) => {
    response.writeHead(status, {
      "content-type": "application/xml",
      "x-amz-request-id": "fixture-request",
    });
    response.end(
      `<Error><Code>${code}</Code><Message>${state.message ?? "Synthetic storage failure"}</Message><RequestId>fixture-request</RequestId></Error>`,
    );
  };
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const region = verifySignature(request, body);
      const url = new URL(request.url ?? "/", "http://fixture.invalid");
      const [bucket, ...segments] = url.pathname
        .slice(1)
        .split("/")
        .map(decodeURIComponent);
      const key = segments.join("/");
      const operation = url.searchParams.has("versioning")
        ? "versioning"
        : url.searchParams.has("policy")
          ? request.method === "DELETE"
            ? "delete-policy"
            : "put-policy"
          : !key
            ? request.method === "HEAD"
              ? "head"
              : "create"
            : request.method === "PUT"
              ? "put"
              : request.method === "GET"
                ? "get"
                : "delete";
      records.push({
        operation,
        bucket,
        key,
        body,
        headers: request.headers,
        region,
      });
      if (state.redirectRegion && region !== state.redirectRegion) {
        response.writeHead(state.location ? 301 : 400, {
          "content-type": "application/xml",
          "x-amz-bucket-region": state.redirectRegion,
          ...(state.location ? { location: state.location } : {}),
        });
        response.end(
          `<Error><Code>AuthorizationHeaderMalformed</Code><Message>Wrong region</Message><Region>${state.redirectRegion}</Region></Error>`,
        );
        return;
      }
      if (state.fault === operation) {
        error(response, 403, "AccessDenied");
        return;
      }
      const existing = buckets.get(bucket);
      if (operation === "head") {
        response.writeHead(existing ? 200 : 404);
        response.end();
        return;
      }
      if (operation === "create") {
        buckets.set(bucket, { objects: new Map() });
        response.writeHead(200);
        response.end();
        return;
      }
      if (!existing) {
        error(response, 404, "NoSuchBucket");
        return;
      }
      if (operation === "versioning") {
        response.setHeader("content-type", "application/xml");
        response.end(
          `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${existing.versioning === undefined ? "" : `<Status>${existing.versioning}</Status>`}</VersioningConfiguration>`,
        );
      } else if (operation === "delete-policy") {
        delete existing.policy;
        response.writeHead(204);
        response.end();
      } else if (operation === "put-policy") {
        existing.policy = JSON.parse(body.toString());
        response.writeHead(204);
        response.end();
      } else if (operation === "put") {
        assert.equal(request.headers["if-none-match"], "*");
        if (existing.objects.has(key)) {
          error(response, 412, "PreconditionFailed");
          return;
        }
        existing.objects.set(key, body);
        response.writeHead(200, { etag: '"fixture-etag"' });
        response.end();
      } else if (operation === "get") {
        const bytes = existing.objects.get(key);
        if (!bytes) {
          error(response, 404, "NoSuchKey");
          return;
        }
        response.writeHead(200, {
          "content-length": bytes.byteLength,
          "content-type": "application/octet-stream",
        });
        if (state.truncate) {
          response.write(bytes.subarray(0, 1));
          setTimeout(() => response.destroy(), 5);
        } else {
          response.write(bytes.subarray(0, 1));
          response.end(bytes.subarray(1));
        }
      } else {
        existing.objects.delete(key);
        response.writeHead(204);
        response.end();
      }
    } catch (failure) {
      failures.push(
        failure instanceof Error ? failure.message : "Fixture failed",
      );
      error(response, 500, "FixtureFailure");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}`;
  endpoints.add(endpoint);
  context.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((failure) => (failure ? reject(failure) : resolve())),
    );
    endpoints.delete(endpoint);
    assert.deepEqual(failures, []);
  });
  const config = {
    accessKey,
    secretKey,
    bucket: "kernel-fixture",
    endPoint: "127.0.0.1",
    port: address.port,
    publicUrl: `${endpoint}/objects/`,
    useSSL: false,
  };
  return {
    buckets,
    records,
    state,
    config,
    storage: new MinioObjectStorage(config),
  };
};

const input = (
  visibility: "private" | "public",
  objectKey = "file/data.bin",
) => ({
  visibility,
  objectKey,
  contentType: "application/octet-stream",
  data: new Uint8Array([0, 1, 127, 255]),
});

test("SDK isolation forbids external network and non-fixture credential files", async () => {
  await assert.rejects(
    async () => fsPromises.readFile(path.join(owned, "foreign", "credentials")),
    /non-fixture AWS profiles/,
  );
  assert.throws(
    () => http.request("http://169.254.169.254/latest/meta-data/"),
    /non-fixture network/,
  );
  for (const file of profileFiles)
    assert.equal(await readFile(file, "utf8"), "");
  assert.equal(process.env.AWS_EC2_METADATA_DISABLED, "true");
});

test("real signed SDK readiness creates owned buckets and replaces stale private/public policies", async (context) => {
  const { buckets, records, storage } = await fixture(context);
  await storage.ensureReady();
  assert.equal(buckets.size, 2);
  const privateBucket = buckets.get("kernel-fixture-private");
  const publicBucket = buckets.get("kernel-fixture-public");
  assert.ok(privateBucket && publicBucket);
  privateBucket.policy = { stale: "anonymous-read" };
  publicBucket.policy = { stale: true };
  const creations = records.filter(
    (record) => record.operation === "create",
  ).length;
  await storage.ensureReady();
  assert.equal(
    records.filter((record) => record.operation === "create").length,
    creations,
  );
  assert.equal(privateBucket.policy, undefined);
  assert.deepEqual(publicBucket.policy, {
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["s3:GetObject"],
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Resource: ["arn:aws:s3:::kernel-fixture-public/*"],
        Sid: "PublicRead",
      },
    ],
  });
  assert.deepEqual(
    records.slice(-2).map((record) => record.operation),
    ["delete-policy", "put-policy"],
  );
});

test("real signed SDK preserves exact bytes, conditional creation, full reads and hard deletion", async (context) => {
  const { storage, records, buckets } = await fixture(context);
  await storage.ensureReady();
  for (const visibility of ["public", "private"] as const) {
    const value = input(visibility, "نام فایل/with ?#%+&.bin");
    const stored = await storage.put(value);
    assert.deepEqual(stored, {
      bucket: `kernel-fixture-${visibility}`,
      objectKey: value.objectKey,
    });
    assert.deepEqual(
      await storage.get(stored.bucket, stored.objectKey),
      value.data,
    );
    await assert.rejects(
      storage.put({ ...value, data: new Uint8Array([99]) }),
      (failure) =>
        failure instanceof S3ServiceException &&
        failure.$metadata.httpStatusCode === 412,
    );
    assert.deepEqual(
      await storage.get(stored.bucket, stored.objectKey),
      value.data,
    );
    await storage.delete(stored.bucket, stored.objectKey);
    assert.equal(
      buckets.get(stored.bucket)?.objects.has(stored.objectKey),
      false,
    );
    await storage.delete(stored.bucket, stored.objectKey);
    await assert.rejects(
      storage.get(stored.bucket, stored.objectKey),
      (failure) =>
        failure instanceof S3ServiceException && failure.name === "NoSuchKey",
    );
  }
  const stored = await storage.put({
    ...input("private", "empty/object"),
    data: new Uint8Array(),
  });
  assert.equal(
    (await storage.get(stored.bucket, stored.objectKey)).byteLength,
    0,
  );
  assert.ok(records.every((record) => !record.key.includes(secretKey)));
});

test("a real response connection failure survives complete-body collection unchanged", async (context) => {
  const { storage, state } = await fixture(context);
  await storage.ensureReady();
  const stored = await storage.put(input("private"));
  state.truncate = true;
  await assert.rejects(
    storage.get(stored.bucket, stored.objectKey),
    (failure) => transportErrors.includes(failure as Error),
  );
});

test("owned bucket and key checks reject invalid operations before any SDK request", async (context) => {
  const { storage, records } = await fixture(context);
  for (const bucket of ["", "other", "kernel-fixture-public/../private"]) {
    await assert.rejects(
      storage.get(bucket, "file/data"),
      /Invalid object storage bucket/,
    );
    await assert.rejects(
      storage.delete(bucket, "file/data"),
      /Invalid object storage bucket/,
    );
    assert.throws(
      () => storage.url(bucket, "file/data", "public"),
      /owned public bucket/,
    );
  }
  for (const key of [
    "",
    ".",
    "..",
    "../out",
    "a/../b",
    "a/./b",
    "/absolute",
    "a//b",
    "a/",
    "a\\b",
    "control\u0000",
    "control\n",
    "a".repeat(1025),
  ]) {
    await assert.rejects(
      storage.get("kernel-fixture-private", key),
      /Invalid object storage object key/,
    );
    await assert.rejects(
      storage.delete("kernel-fixture-private", key),
      /Invalid object storage object key/,
    );
    await assert.rejects(
      storage.put(input("public", key)),
      /Invalid object storage object key/,
    );
    assert.throws(
      () => storage.url("kernel-fixture-public", key, "public"),
      /Invalid object storage object key/,
    );
  }
  await assert.rejects(
    storage.put({ ...input("private"), visibility: "other" as never }),
    /Invalid object storage visibility/,
  );
  assert.equal(
    storage.url("kernel-fixture-private", "file/data", "private"),
    undefined,
  );
  assert.equal(
    storage.url("kernel-fixture-public", "file/data", "unknown"),
    undefined,
  );
  assert.throws(
    () => storage.url("kernel-fixture-private", "file/data", "public"),
    /owned public bucket/,
  );
  assert.deepEqual(records, []);
});

test("constructor validation keeps plaintext restricted to real loopback endpoints", async (context) => {
  const { config, records } = await fixture(context);
  for (const endPoint of [
    "storage.example.test",
    "localhost.example.test",
    "127.example.test",
    "192.0.2.1",
    "2001:db8::1",
  ]) {
    assert.throws(
      () => new MinioObjectStorage({ ...config, endPoint }),
      /TLS is required/,
    );
  }
  for (const endPoint of [
    "127.0.0.256",
    "127.999.0.1",
    "127.1",
    "",
    "http://localhost",
    "localhost/path",
    "localhost:9000",
    "user@localhost",
  ]) {
    assert.throws(
      () => new MinioObjectStorage({ ...config, endPoint }),
      /Invalid MinIO endpoint/,
    );
  }
  for (const endPoint of [
    "localhost",
    "LOCALHOST",
    "127.0.0.2",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
  ]) {
    assert.doesNotThrow(() => new MinioObjectStorage({ ...config, endPoint }));
  }
  assert.doesNotThrow(
    () =>
      new MinioObjectStorage({
        ...config,
        endPoint: "storage.example.test",
        useSSL: true,
      }),
  );
  for (const changes of [{ accessKey: "" }, { secretKey: " " }])
    assert.throws(
      () => new MinioObjectStorage({ ...config, ...changes }),
      /Explicit MinIO credentials/,
    );
  for (const changes of [
    { port: 0 },
    { port: 65536 },
    { port: 1.5 },
    { bucket: "UPPER" },
    { bucket: "a..b" },
    { bucket: "a".repeat(60) },
    { useSSL: "false" as never },
  ]) {
    assert.throws(
      () => new MinioObjectStorage({ ...config, ...changes }),
      /Invalid/,
    );
  }
  assert.deepEqual(records, []);
});

test("public URLs preserve configured prefixes and encoded values without traversal or credentials", () => {
  assert.equal(
    publicObjectUrl(
      "https://cdn.example.test/assets/",
      "owned-public",
      "file id?#/a%+&.bin",
    ),
    "https://cdn.example.test/assets/owned-public/file%20id%3F%23/a%25%2B%26.bin",
  );
  assert.equal(
    publicObjectUrl("http://[::1]:9000/assets/", "owned-public", "id/file"),
    "http://[::1]:9000/assets/owned-public/id/file",
  );
  assert.equal(
    decodeURIComponent(
      new URL(
        publicObjectUrl(
          "https://cdn.example.test/",
          "owned-public",
          "نام/فایل.txt",
        ),
      ).pathname,
    ),
    "/owned-public/نام/فایل.txt",
  );
  for (const base of [
    "not a URL",
    "ftp://cdn.example.test/",
    "http://cdn.example.test/",
    "https://user:password@cdn.example.test/",
    "https://cdn.example.test/?key=value",
    "https://cdn.example.test/#fragment",
  ]) {
    assert.throws(
      () => publicObjectUrl(base, "owned-public", "id/file"),
      /public object storage URL|Public object storage URLs/,
    );
  }
  assert.throws(
    () => publicObjectUrl("https://cdn.example.test/", "../other", "id/file"),
    /Invalid object storage bucket/,
  );
});

test("readiness propagates real S3 permission failures without creating or granting later resources", async (context) => {
  for (const operation of [
    "head",
    "create",
    "versioning",
    "delete-policy",
    "put-policy",
  ]) {
    const { storage, records, state } = await fixture(context);
    state.fault = operation;
    await assert.rejects(
      storage.ensureReady(),
      (failure) =>
        failure instanceof S3ServiceException &&
        (operation === "head" || failure.name === "AccessDenied") &&
        failure.$metadata.httpStatusCode === 403,
    );
    assert.equal(records.at(-1)?.operation, operation);
    assert.equal(
      records.filter((record) => record.operation === operation).length,
      1,
    );
    if (operation === "delete-policy")
      assert.equal(
        records.some((record) => record.operation === "put-policy"),
        false,
      );
  }
});

test("versioning fails closed at startup and again before writes or deletion", async (context) => {
  for (const versioning of ["Enabled", "Suspended", "Unexpected", ""]) {
    const { buckets, storage, records } = await fixture(context);
    const privateBucket: Bucket = {
      objects: new Map<string, Buffer>(),
      versioning,
    };
    buckets.set("kernel-fixture-private", privateBucket);
    buckets.set("kernel-fixture-public", { objects: new Map() });
    await assert.rejects(storage.ensureReady(), /unversioned buckets/);
    assert.equal(
      records.some((record) => record.operation.endsWith("policy")),
      false,
    );
    delete privateBucket.versioning;
    await storage.ensureReady();
    privateBucket.versioning = versioning;
    const before = records.filter((record) =>
      ["put", "delete"].includes(record.operation),
    ).length;
    await assert.rejects(storage.put(input("private")), /unversioned buckets/);
    await assert.rejects(
      storage.delete("kernel-fixture-private", "file/data.bin"),
      /unversioned buckets/,
    );
    assert.equal(
      records.filter((record) => ["put", "delete"].includes(record.operation))
        .length,
      before,
    );
  }
});

test("concurrent signed conditional uploads keep the first object's bytes intact", async (context) => {
  const { storage } = await fixture(context);
  await storage.ensureReady();
  const first = input("private", "collision/object");
  const second = { ...first, data: new Uint8Array([9, 8, 7]) };
  const results = await Promise.allSettled([
    storage.put(first),
    storage.put(second),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const winner = results[0].status === "fulfilled" ? first : second;
  const loser = results.find((result) => result.status === "rejected");
  assert.ok(
    loser?.status === "rejected" && loser.reason instanceof S3ServiceException,
  );
  assert.equal(loser.reason.$metadata.httpStatusCode, 412);
  assert.deepEqual(
    await storage.get("kernel-fixture-private", first.objectKey),
    winner.data,
  );
});

test("explicit custom regions sign every request while wrong regions and arbitrary redirects fail closed", async (context) => {
  const { config, storage, state, records } = await fixture(context);
  state.redirectRegion = "warehouse-region-1";
  await assert.rejects(
    storage.ensureReady(),
    (failure) =>
      failure instanceof S3ServiceException &&
      failure.$metadata.httpStatusCode === 400,
  );
  assert.equal(records.length, 1);
  const configured = new MinioObjectStorage({
    ...config,
    region: state.redirectRegion,
  });
  await configured.ensureReady();
  const stored = await configured.put(input("private"));
  assert.deepEqual(
    await configured.get(stored.bucket, stored.objectKey),
    input("private").data,
  );
  assert.ok(
    records.slice(1).every((record) => record.region === state.redirectRegion),
  );
  state.location = "http://192.0.2.123/unrelated-bucket";
  const before = records.length;
  await assert.rejects(
    storage.ensureReady(),
    (failure) =>
      failure instanceof S3ServiceException &&
      failure.$metadata.httpStatusCode === 301,
  );
  assert.equal(records.length, before + 1);
});

test("the factory selects the reviewed local adapter or signed MinIO adapter and rejects an invalid driver", async (context) => {
  const { config: minio, records } = await fixture(context);
  const config = loadConfig({
    BETTER_AUTH_SECRET:
      "synthetic-storage-secret-with-at-least-thirty-two-characters",
    NODE_ENV: "test",
    STORAGE_DRIVER: "local",
    LOCAL_STORAGE_PATH: path.join(owned, "factory-local"),
  });
  const local = createObjectStorage(config);
  assert.ok(local instanceof LocalFileStorage);
  const value = input("private");
  const stored = await local.put(value);
  await assert.rejects(local.put(value), { code: "EEXIST" });
  assert.deepEqual(
    new Uint8Array(await local.get(stored.bucket, stored.objectKey)),
    value.data,
  );
  await local.delete(stored.bucket, stored.objectKey);
  const remote = createObjectStorage({
    ...config,
    storageDriver: "minio",
    minio,
  });
  assert.ok(remote instanceof MinioObjectStorage);
  await remote.ensureReady();
  assert.ok(records.some((record) => record.operation === "put-policy"));
  assert.throws(
    () => createObjectStorage({ ...config, storageDriver: "unknown" as never }),
    /Unsupported object storage driver/,
  );
});

test("real SDK operation failures preserve their identity and cannot leak raw storage details into diagnostics", async (context) => {
  const { storage, state, buckets } = await fixture(context);
  await storage.ensureReady();
  const stored = await storage.put(input("private"));
  state.fault = "delete";
  await assert.rejects(
    storage.delete(stored.bucket, stored.objectKey),
    (failure) =>
      failure instanceof S3ServiceException &&
      failure.$metadata.httpStatusCode === 403,
  );
  assert.ok(buckets.get(stored.bucket)?.objects.has(stored.objectKey));
  state.fault = "put";
  await assert.rejects(
    storage.put(input("private", "failed/object")),
    (failure) =>
      failure instanceof S3ServiceException &&
      failure.$metadata.httpStatusCode === 403,
  );
  assert.equal(buckets.get(stored.bucket)?.objects.has("failed/object"), false);
  state.fault = "get";
  state.message = `${secretKey} ${stored.bucket}/${stored.objectKey}`;
  const lines: string[] = [];
  const logger = createLogger(
    { environment: "test", level: "debug", pretty: false, release: "fixture" },
    { write: (line) => lines.push(line) },
  );
  let original: unknown;
  await assert.rejects(
    withStorageLogging(logger, "minio", "get", async () => {
      try {
        return await storage.get(stored.bucket, stored.objectKey);
      } catch (failure) {
        original = failure;
        throw failure;
      }
    }),
    (failure) =>
      failure === original &&
      failure instanceof S3ServiceException &&
      failure.message.includes(secretKey),
  );
  assert.equal(lines.length, 1);
  assert.doesNotMatch(
    lines[0],
    /fixture-secret|kernel-fixture|data\.bin|AccessDenied/,
  );
  const record = JSON.parse(lines[0]);
  assert.equal(record.event, "storage.operation.failed");
  assert.equal(record.operation, "get");
  assert.equal(record.storageDriver, "minio");
});
