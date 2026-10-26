import type { Actor } from "../models.ts";

export type FileRecord = {
  bucket: string;
  contentType: string;
  createdAt: Date;
  createdBy: string;
  id: string;
  objectKey: string;
  originalName: string;
  size: number;
  visibility: "private" | "public";
};

export type FileRepository = {
  findById(id: string): Promise<FileRecord | undefined>;
  insert(record: FileRecord): Promise<void>;
};

export type UploadFileSource = {
  name: string;
  read(): Promise<Uint8Array>;
  size: number;
  type: string;
};

export type FileUploadInput = {
  actor: Actor;
  source?: UploadFileSource;
  visibility: unknown;
};

export type FileUploadStage =
  "validation" | "read" | "storage" | "metadata" | "response";

export type UploadedFile = {
  contentType: FileRecord["contentType"];
  id: FileRecord["id"];
  url?: string;
  visibility: FileRecord["visibility"];
};

export type FileEvents = {
  cleanupFailed?(event: { error: unknown; fileId: string }): void;
  stage?(stage: FileUploadStage): void;
  storageFailed?(event: {
    fileId?: string;
    operation: "delete" | "get" | "put";
  }): void;
  uploaded?(event: {
    contentType: FileRecord["contentType"];
    fileId: FileRecord["id"];
    sizeBytes: FileRecord["size"];
    visibility: FileRecord["visibility"];
  }): void;
};

export type PublicFileContent = {
  contents: Uint8Array;
  record: FileRecord;
};
