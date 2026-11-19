import {
  type FileContext,
  type StoredFileResponse,
} from "../contracts/files.ts";
import { ApplicationError } from "./errors.ts";
import type {
  FileEvents,
  FileRepository,
  FileUploadInput,
  PublicFileContent,
  UploadedFile,
} from "./ports/files.ts";
import { FileInsertNotCommittedError } from "./ports/files.ts";
import type { ObjectStorage } from "./ports/object-storage.ts";

const safeObjectName = (name: string) => {
  const segment = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return segment === "." || segment === ".." ? "upload" : segment;
};

const observe = (notify: () => unknown) => {
  try {
    void Promise.resolve(notify()).catch(() => undefined);
  } catch {
    // Diagnostic observers must not change storage effects or mask domain failures.
  }
};

type FilesDependencies = {
  getImageUploadLimit(context: FileContext): Promise<number>;
  newId(): string;
  now(): Date;
  repository: FileRepository;
  storage: ObjectStorage;
  uploadLimitBytes: number;
};

export const createFilesService = ({
  getImageUploadLimit,
  newId,
  now,
  repository,
  storage,
  uploadLimitBytes,
}: FilesDependencies) => {
  const validateSize = (size: number, limit: number) => {
    if (!size) throw new ApplicationError("invalid", "fileEmpty");
    if (size > limit) throw new ApplicationError("too-large", "fileTooLarge");
  };

  const storageOperation = async <T>(
    operation: "delete" | "get" | "put",
    run: () => Promise<T>,
    events?: FileEvents,
    fileId?: string,
  ): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      observe(() => events?.storageFailed?.({ fileId, operation }));
      throw error;
    }
  };

  return {
    async list(): Promise<StoredFileResponse[]> {
      return (await repository.list()).map((file) => {
        const url = storage.url(file.bucket, file.objectKey, file.visibility);
        return {
          id: file.id,
          is_used: file.isUsed,
          size: file.size,
          ...(url && { url }),
        };
      });
    },
    async remove(id: string, events?: FileEvents): Promise<void> {
      const pending = await repository.beginDeletion(id);
      if (!pending) throw new ApplicationError("not-found", "fileNotFound");

      await storageOperation(
        "delete",
        () => storage.delete(pending.bucket, pending.objectKey),
        events,
        id,
      );
      await repository.finishDeletion(id);
    },
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
      { actor, context, source, visibility }: FileUploadInput,
      events?: FileEvents,
    ): Promise<UploadedFile> => {
      observe(() => events?.stage?.("validation"));
      if (!source) {
        throw new ApplicationError("invalid", "fieldRequired", {
          field: "file",
        });
      }
      const imageContext = context === "logo" ? context : undefined;
      if (context !== undefined) {
        if (!imageContext)
          throw new ApplicationError("invalid", "fieldInvalid", {
            field: "context",
          });
        if (visibility !== undefined && visibility !== "public")
          throw new ApplicationError("invalid", "visibilityInvalid");
        visibility = "public";
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
      const maximum = imageContext
        ? Math.min(uploadLimitBytes, await getImageUploadLimit(imageContext))
        : uploadLimitBytes;
      validateSize(source.size, maximum);
      const id = newId();
      const objectKey = `${id}/${safeObjectName(source.name || "upload")}`;
      const contentType = source.type || "application/octet-stream";
      observe(() => events?.stage?.("read"));
      const data = await source.read();
      const size = data.byteLength;
      validateSize(size, maximum);
      const createdAt = now();
      observe(() => events?.stage?.("storage"));
      const stored = await storageOperation(
        "put",
        () => storage.put({ contentType, data, objectKey, visibility }),
        events,
        id,
      );
      observe(() => events?.stage?.("metadata"));
      try {
        await repository.insert({
          bucket: stored.bucket,
          contentType,
          createdAt,
          createdBy: actor.account.id,
          id,
          objectKey: stored.objectKey,
          originalName: source.name || "upload",
          size,
          visibility,
        });
      } catch (error) {
        if (!(error instanceof FileInsertNotCommittedError)) throw error;

        try {
          await storageOperation(
            "delete",
            () => storage.delete(stored.bucket, stored.objectKey),
            events,
            id,
          );
        } catch (cleanupError) {
          observe(() =>
            events?.cleanupFailed?.({ error: cleanupError, fileId: id }),
          );
        }
        throw error.cause;
      }
      observe(() => events?.stage?.("response"));
      const url =
        visibility === "public"
          ? storage.url(stored.bucket, stored.objectKey, visibility)
          : undefined;
      observe(() =>
        events?.uploaded?.({
          contentType,
          fileId: id,
          sizeBytes: size,
          visibility,
        }),
      );
      return { contentType, id, size, ...(url && { url }), visibility };
    },
  };
};

export type FilesService = ReturnType<typeof createFilesService>;
