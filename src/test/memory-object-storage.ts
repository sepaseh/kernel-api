import type { ObjectStorage } from "../application/ports/object-storage.ts";
import { publicObjectUrl } from "../infrastructure/storage/url.ts";

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, Uint8Array>();

  async delete(bucket: string, objectKey: string) {
    this.objects.delete(`${bucket}/${objectKey}`);
  }

  async ensureReady() {}

  async get(bucket: string, objectKey: string) {
    const value = this.objects.get(`${bucket}/${objectKey}`);
    if (!value) throw new Error("Object not found.");
    return value;
  }

  async put(input: {
    contentType: string;
    data: Uint8Array;
    objectKey: string;
    visibility: "private" | "public";
  }) {
    const bucket = `test-${input.visibility}`;
    this.objects.set(`${bucket}/${input.objectKey}`, input.data);
    return { bucket, objectKey: input.objectKey };
  }

  url(bucket: string, objectKey: string, visibility: string) {
    return visibility === "public"
      ? publicObjectUrl("https://storage.test", bucket, objectKey)
      : undefined;
  }
}
