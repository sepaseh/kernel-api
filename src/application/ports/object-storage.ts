type StoredObject = {
  bucket: string;
  objectKey: string;
};

export type ObjectStorage = {
  delete(bucket: string, objectKey: string): Promise<void>;
  ensureReady(signal?: AbortSignal): Promise<void>;
  get(bucket: string, objectKey: string): Promise<Uint8Array>;
  // The adapter owns cleanup of partial writes it can attribute to this call.
  // A rejected put does not authorize deletion of an object at the same key.
  put(input: {
    contentType: string;
    data: Uint8Array;
    objectKey: string;
    visibility: "private" | "public";
  }): Promise<StoredObject>;
  url(
    bucket: string,
    objectKey: string,
    visibility: string,
  ): string | undefined;
};
