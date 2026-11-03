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

export class FileInsertNotCommittedError extends Error {
  constructor(cause: unknown) {
    super("File metadata insert did not commit.", { cause });
    this.name = "FileInsertNotCommittedError";
  }
}

export type FileRepository = {
  findById(id: string): Promise<FileRecord | undefined>;
  // Use FileInsertNotCommittedError only when the insert is known not to have
  // committed. Other rejections may leave a row referencing the stored bytes.
  insert(record: FileRecord): Promise<void>;
};

export type UploadFileSource = {
  name: string;
  read(): Promise<Uint8Array>;
  // Declared size permits early rejection; the service also validates actual bytes.
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

// Best-effort diagnostics; observer exceptions and rejections cannot affect file operations.
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
