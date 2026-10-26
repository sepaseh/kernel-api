import { ApplicationError } from "./errors.ts";
import type {
  FileEvents,
  FileRepository,
  FileUploadInput,
  PublicFileContent,
  UploadedFile,
} from "./ports/files.ts";
import type { ObjectStorage } from "./ports/object-storage.ts";

const safeObjectName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

type FilesDependencies = {
  newId(): string;
  now(): Date;
  repository: FileRepository;
  storage: ObjectStorage;
  uploadLimitBytes: number;
};

export const createFilesService = ({
  newId,
  now,
  repository,
  storage,
  uploadLimitBytes,
}: FilesDependencies) => {
  const storageOperation = async <T>(
    operation: "delete" | "get" | "put",
    run: () => Promise<T>,
    events?: FileEvents,
    fileId?: string,
  ): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      events?.storageFailed?.({ fileId, operation });
      throw error;
    }
  };

  return {
    getPublicContent: async (
      id: string,
      events?: FileEvents,
    ): Promise<PublicFileContent> => {
      const record = await repository.findById(id);
      if (record?.visibility !== "public") {
        throw new ApplicationError("not-found", "fileNotFound");
      }
      const contents = await storageOperation(
        "get",
        () => storage.get(record.bucket, record.objectKey),
        events,
      );
      return { contents, record };
    },
    upload: async (
      { actor, source, visibility }: FileUploadInput,
      events?: FileEvents,
    ): Promise<UploadedFile> => {
      events?.stage?.("validation");
      if (!source) {
        throw new ApplicationError("invalid", "fieldRequired", {
          field: "file",
        });
      }
      if (visibility !== "public" && visibility !== "private") {
        throw new ApplicationError("invalid", "visibilityInvalid");
      }
      if (
        visibility === "public" &&
        !actor.account.isSystemAdmin &&
        !actor.permissions.includes("settings.update")
      ) {
        throw new ApplicationError("forbidden", "publicUploadDenied");
      }
      if (!source.size) throw new ApplicationError("invalid", "fileEmpty");
      if (source.size > uploadLimitBytes) {
        throw new ApplicationError("too-large", "fileTooLarge");
      }
      const id = newId();
      const objectKey = `${id}/${safeObjectName(source.name || "upload")}`;
      const contentType = source.type || "application/octet-stream";
      events?.stage?.("read");
      const data = await source.read();
      events?.stage?.("storage");
      const stored = await storageOperation(
        "put",
        () => storage.put({ contentType, data, objectKey, visibility }),
        events,
        id,
      );
      events?.stage?.("metadata");
      try {
        await repository.insert({
          bucket: stored.bucket,
          contentType,
          createdAt: now(),
          createdBy: actor.account.id,
          id,
          objectKey: stored.objectKey,
          originalName: source.name || "upload",
          size: source.size,
          visibility,
        });
      } catch (error) {
        try {
          await storageOperation(
            "delete",
            () => storage.delete(stored.bucket, stored.objectKey),
            events,
            id,
          );
        } catch (cleanupError) {
          events?.cleanupFailed?.({ error: cleanupError, fileId: id });
        }
        throw error;
      }
      events?.stage?.("response");
      const url = storage.url(stored.bucket, stored.objectKey, visibility);
      events?.uploaded?.({
        contentType,
        fileId: id,
        sizeBytes: source.size,
        visibility,
      });
      return { contentType, id, ...(url && { url }), visibility };
    },
  };
};

export type FilesService = ReturnType<typeof createFilesService>;
