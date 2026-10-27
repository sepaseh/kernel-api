import { createAccountService } from "../application/account.ts";
import { createAuthService } from "../application/auth.ts";
import { createCalendarService } from "../application/calendar.ts";
import { createFilesService } from "../application/files.ts";
import { createRolesService } from "../application/roles.ts";
import { createSettingsService } from "../application/settings.ts";
import { createUsersService } from "../application/users.ts";
import { createAuthGateway } from "../infrastructure/auth/gateway.ts";
import { createOtpGateway } from "../infrastructure/auth/otp.ts";
import { createAccountPersistence } from "../infrastructure/persistence/account.ts";
import { createAuthPersistence } from "../infrastructure/persistence/auth.ts";
import { createDrizzleCalendarRepository } from "../infrastructure/persistence/calendar.ts";
import { createDrizzleFileRepository } from "../infrastructure/persistence/files.ts";
import { createDrizzleRolesRepository } from "../infrastructure/persistence/roles.ts";
import { createDrizzleSettingsRepository } from "../infrastructure/persistence/settings.ts";
import { createDrizzleUsersRepository } from "../infrastructure/persistence/users.ts";
import { createHttpApp } from "../presentation/http/app.ts";
import type { HttpDependencies } from "../presentation/http/dependencies.ts";
import type { Dependencies } from "./composition-dependencies.ts";

export const createApp = ({
  auth,
  config,
  database,
  logger,
  storage,
}: Dependencies) => {
  const persistence = createAuthPersistence(database);
  const otp = createOtpGateway(config, database);
  const services: HttpDependencies["services"] = {
    account: createAccountService({
      persistence: createAccountPersistence(database),
      otp,
    }),
    auth: {
      fromRequest(headers) {
        const gateway = createAuthGateway(auth, headers);
        return {
          ...createAuthService({
            provider: gateway.provider,
            persistence,
            otp,
          }),
          responseCookies: gateway.responseCookies,
        };
      },
    },
    calendar: createCalendarService(createDrizzleCalendarRepository(database)),
    files: createFilesService({
      repository: createDrizzleFileRepository(database),
      storage,
      uploadLimitBytes: config.uploadLimitBytes,
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
    }),
    roles: createRolesService(createDrizzleRolesRepository(database)),
    settings: createSettingsService(
      createDrizzleSettingsRepository(database),
      (file) => storage.url(file.bucket, file.objectKey, file.visibility),
    ),
    users: createUsersService({
      provider: createAuthGateway(auth).provider,
      repository: createDrizzleUsersRepository(database),
    }),
  };
  return createHttpApp({
    services,
    logger,
    config: {
      allowedOrigins: config.allowedOrigins,
      storageDriver: config.storageDriver,
      uploadLimitBytes: config.uploadLimitBytes,
    },
  });
};
