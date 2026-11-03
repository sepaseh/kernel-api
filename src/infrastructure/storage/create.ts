import type { ObjectStorage } from "../../application/ports/object-storage.ts";
import type { ServerConfig } from "../config.ts";
import { LocalFileStorage } from "./local.ts";
import { MinioObjectStorage } from "./minio.ts";

export const createObjectStorage = (config: ServerConfig): ObjectStorage => {
  switch (config.storageDriver) {
    case "local":
      return new LocalFileStorage(config);
    case "minio":
      return new MinioObjectStorage(config.minio);
    default:
      throw new Error("Unsupported object storage driver.");
  }
};
