import type { AccountService } from "../../application/account.ts";
import type { AuthService } from "../../application/auth.ts";
import type { createCalendarService } from "../../application/calendar.ts";
import type { createContentCategoriesService } from "../../application/content-categories.ts";
import type { ContentsService } from "../../application/contents.ts";
import type { FilesService } from "../../application/files.ts";
import type { createRolesService } from "../../application/roles.ts";
import type { createSettingsService } from "../../application/settings.ts";
import type { UsersService } from "../../application/users.ts";
import type { AppLogger } from "../../infrastructure/logging/logger.ts";

export type HttpDependencies = {
  config: {
    allowedOrigins: string[];
    storageDriver: "local" | "minio";
    uploadLimitBytes: number;
  };
  logger: AppLogger;
  services: {
    account: AccountService;
    auth: {
      fromRequest(
        headers: Headers,
      ): AuthService & { responseCookies(): string[] };
    };
    calendar: ReturnType<typeof createCalendarService>;
    contentCategories: ReturnType<typeof createContentCategoriesService>;
    contents: ContentsService;
    files: FilesService;
    roles: ReturnType<typeof createRolesService>;
    settings: ReturnType<typeof createSettingsService>;
    users: UsersService;
  };
};
