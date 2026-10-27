import type { ObjectStorage } from "../application/ports/object-storage.ts";
import { publicObjectUrl } from "../infrastructure/storage/url.ts";

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, Uint8Array>();

  delete(bucket: string, objectKey: string) {
    this.objects.delete(`${bucket}/${objectKey}`);
    return Promise.resolve();
  }

  ensureReady() {
    return Promise.resolve();
  }

  get(bucket: string, objectKey: string) {
    const value = this.objects.get(`${bucket}/${objectKey}`);
    if (!value) return Promise.reject(new Error("Object not found."));
    return Promise.resolve(value);
  }

  put(input: {
    contentType: string;
    data: Uint8Array;
    objectKey: string;
    visibility: "private" | "public";
  }) {
    const bucket = `test-${input.visibility}`;
    this.objects.set(`${bucket}/${input.objectKey}`, input.data);
    return Promise.resolve({ bucket, objectKey: input.objectKey });
  }

  url(bucket: string, objectKey: string, visibility: string) {
    return visibility === "public"
      ? publicObjectUrl("https://storage.test", bucket, objectKey)
      : undefined;
  }
}
