import { Hono } from "hono";

import type { FileEvents } from "../../../application/ports/files.ts";
import type { AppEnvironment } from "../http.ts";
import { ApiError, authenticate } from "../http.ts";

// Allow bounded multipart framing and metadata in addition to the file itself.
// The limit applies to bytes read, regardless of Content-Length or chunking.
const multipartOverheadBytes = 64 * 1024;

export const readBoundedMultipart = async (
  request: Request,
  fileLimit: number,
) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^\s*multipart\/form-data(?:\s*;|\s*$)/i.test(contentType))
    throw new ApiError(415, "fieldInvalid", { field: "Content-Type" });
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "fieldRequired", { field: "file" });

  const maximum = Math.min(
    Number.MAX_SAFE_INTEGER,
    fileLimit + multipartOverheadBytes,
  );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        void reader.cancel().catch(() => undefined);
        throw new ApiError(413, "fileTooLarge");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(Buffer.concat(chunks, size));
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new ApiError(400, "fieldInvalid", { field: "file" });
  }
};

const inlineContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export const createFileRoutes = () => {
  const app = new Hono<AppEnvironment>();

  app.get("/:fileId/content", async (context) => {
    const dependencies = context.get("dependencies");
    const { contents, record } =
      await dependencies.services.files.getPublicContent(
        context.req.param("fileId"),
        {
          storageFailed: ({ operation }) => {
            context.get("logger").error(
              {
                event: "storage.operation.failed",
                operation,
                storageDriver: dependencies.config.storageDriver,
              },
              "Storage operation failed",
            );
          },
        },
      );
    const inline = inlineContentTypes.has(record.contentType.toLowerCase());
    return new Response(Buffer.from(contents), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        ...(!inline && {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
        }),
        "Content-Length": String(contents.byteLength),
        "Content-Type": inline
          ? record.contentType
          : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.post("/", async (context) => {
    const actor = await authenticate(context);
    context.set("uploadStage", "validation");
    const dependencies = context.get("dependencies");
    const form = await readBoundedMultipart(
      context.req.raw,
      dependencies.config.uploadLimitBytes,
    );
    const file = form.get("file");
    const events: FileEvents = {
      cleanupFailed: ({ error, fileId }) => {
        context
          .get("logger")
          .child({ fileId })
          .error(
            { err: error, event: "storage.cleanup.failed" },
            "Object cleanup after metadata failure failed",
          );
      },
      stage: (stage) => context.set("uploadStage", stage),
      storageFailed: ({ fileId, operation }) => {
        const logger = fileId
          ? context.get("logger").child({ fileId })
          : context.get("logger");
        logger.error(
          {
            event: "storage.operation.failed",
            operation,
            storageDriver: dependencies.config.storageDriver,
          },
          "Storage operation failed",
        );
      },
      uploaded: ({ fileId, ...details }) => {
        context
          .get("logger")
          .child({ fileId })
          .info(
            { ...details, event: "file.upload.completed" },
            "File upload completed",
          );
      },
    };
    const result = await dependencies.services.files.upload(
      {
        actor,
        source:
          file instanceof File
            ? {
                name: file.name,
                read: async () => new Uint8Array(await file.arrayBuffer()),
                size: file.size,
                type: file.type,
              }
            : undefined,
        visibility: form.get("visibility"),
      },
      events,
    );
    return context.json(
      {
        content_type: result.contentType,
        id: result.id,
        ...(result.url && { url: result.url }),
        visibility: result.visibility,
      },
      201,
    );
  });

  return app;
};
