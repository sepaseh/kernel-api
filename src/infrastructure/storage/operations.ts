import type { ServerConfig } from "../config.ts";
import type { AppLogger } from "../logging/logger.ts";

export const withStorageLogging = async <T>(
  logger: AppLogger,
  driver: ServerConfig["storageDriver"],
  operation: "delete" | "ensureReady" | "get" | "put",
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    try {
      logger.error(
        { event: "storage.operation.failed", operation, storageDriver: driver },
        "Storage operation failed",
      );
    } catch {
      // A failed diagnostic must not replace the original storage failure.
    }
    throw error;
  }
};
