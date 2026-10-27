import type { ObjectStorage } from "../application/ports/object-storage.ts";
import type { Auth } from "../infrastructure/auth/better-auth.ts";
import type { ServerConfig } from "../infrastructure/config.ts";
import type { Database } from "../infrastructure/db/client.ts";
import type { AppLogger } from "../infrastructure/logging/logger.ts";

export type Dependencies = {
  auth: Auth;
  config: ServerConfig;
  database: Database;
  logger: AppLogger;
  storage: ObjectStorage;
};
