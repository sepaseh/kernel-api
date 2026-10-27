import { isIP } from "node:net";

import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import type { ObjectStorage } from "../../application/ports/object-storage.ts";
import type { ServerConfig } from "../config.ts";
import { resolveMinioRegion } from "../config.ts";
import {
  assertObjectKey,
  assertStorageBucket,
  isLoopbackHost,
  normalizedPublicBaseUrl,
  publicObjectUrl,
} from "./url.ts";

const endpointUrl = (config: ServerConfig["minio"]) => {
  const raw = config.endPoint;
  const host =
    raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const ip = isIP(host);
  const domain =
    host.length <= 253 &&
    host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  if (
    (!ip && (!domain || /^[\d.]+$/.test(host))) ||
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535 ||
    typeof config.useSSL !== "boolean"
  )
    throw new Error("Invalid MinIO endpoint configuration.");
  if (!config.useSSL && !isLoopbackHost(host))
    throw new Error("TLS is required for non-loopback MinIO endpoints.");
  const endpointHost = ip === 6 ? `[${host}]` : host;
  return `${config.useSSL ? "https" : "http"}://${endpointHost}:${config.port}`;
};

const publicReadPolicy = (bucket: string) =>
  JSON.stringify({
    Statement: [
      {
        Action: ["s3:GetObject"],
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Resource: [`arn:aws:s3:::${bucket}/*`],
        Sid: "PublicRead",
      },
    ],
    Version: "2012-10-17",
  });

export class MinioObjectStorage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #privateBucket: string;
  readonly #publicBucket: string;
  readonly #publicUrl: string;

  constructor(config: ServerConfig["minio"]) {
    if (!config.accessKey.trim() || !config.secretKey.trim())
      throw new Error("Explicit MinIO credentials are required.");
    const endpoint = endpointUrl(config);
    this.#privateBucket = `${config.bucket}-private`;
    this.#publicBucket = `${config.bucket}-public`;
    assertStorageBucket(this.#privateBucket);
    assertStorageBucket(this.#publicBucket);
    this.#publicUrl = normalizedPublicBaseUrl(config.publicUrl);
    this.#client = new S3Client({
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      endpoint,
      region: resolveMinioRegion(config.region),
      followRegionRedirects: false,
      forcePathStyle: true,
      maxAttempts: 3,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 30_000 },
    });
  }

  async ensureReady() {
    await this.#ensureBucket(this.#privateBucket);
    await this.#ensureBucket(this.#publicBucket);
    await this.#client.send(
      new DeleteBucketPolicyCommand({ Bucket: this.#privateBucket }),
    );
    await this.#client.send(
      new PutBucketPolicyCommand({
        Bucket: this.#publicBucket,
        Policy: publicReadPolicy(this.#publicBucket),
      }),
    );
  }

  async put(input: {
    contentType: string;
    data: Uint8Array;
    objectKey: string;
    visibility: "private" | "public";
  }) {
    if (input.visibility !== "private" && input.visibility !== "public")
      throw new Error("Invalid object storage visibility.");
    const bucket =
      input.visibility === "public" ? this.#publicBucket : this.#privateBucket;
    this.#assertOwned(bucket, input.objectKey);
    await this.#assertUnversioned(bucket);
    await this.#client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
        Body: input.data,
        ContentLength: input.data.byteLength,
        ContentType: input.contentType,
        IfNoneMatch: "*",
      }),
    );
    return { bucket, objectKey: input.objectKey };
  }

  async get(bucket: string, objectKey: string) {
    this.#assertOwned(bucket, objectKey);
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    if (!result.Body)
      throw new Error("Object storage returned no response body.");
    return result.Body.transformToByteArray();
  }

  async delete(bucket: string, objectKey: string) {
    this.#assertOwned(bucket, objectKey);
    await this.#assertUnversioned(bucket);
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
  }

  url(bucket: string, objectKey: string, visibility: string) {
    if (visibility !== "public") return undefined;
    if (bucket !== this.#publicBucket)
      throw new Error("Public object URLs require the owned public bucket.");
    return publicObjectUrl(this.#publicUrl, bucket, objectKey);
  }

  #assertOwned(bucket: string, objectKey: string) {
    if (bucket !== this.#privateBucket && bucket !== this.#publicBucket)
      throw new Error("Invalid object storage bucket.");
    assertObjectKey(objectKey);
  }

  async #ensureBucket(bucket: string) {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (
        !(error instanceof S3ServiceException) ||
        error.$metadata.httpStatusCode !== 404
      )
        throw error;
      await this.#client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    await this.#assertUnversioned(bucket);
  }

  async #assertUnversioned(bucket: string) {
    const versioning = await this.#client.send(
      new GetBucketVersioningCommand({ Bucket: bucket }),
    );
    if (versioning.Status !== undefined)
      throw new Error(
        "Object storage requires unversioned buckets for hard deletion.",
      );
  }
}
