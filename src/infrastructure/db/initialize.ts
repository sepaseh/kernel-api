import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";

import { internalEmail } from "../../application/identity.ts";
import { permissionKeys } from "../../application/permissions.ts";
import type { Auth } from "../auth/better-auth.ts";
import type { ServerConfig } from "../config.ts";
import { getTranslator } from "../localization/i18n.ts";
import type { Database } from "./client.ts";
import {
  account,
  calendarDates,
  rolePermissions,
  roles,
  settings,
  user,
  userRoles,
} from "./schema.ts";

const defaultDarkTheme = {
  color_bg_base: "#141414",
  color_bg_container: "#1f1f1f",
  color_border: "#424242",
  color_link: "#1668dc",
  color_primary: "#61dafb",
  color_text_base: "#ffffff",
  color_text_description: "#bfbfbf",
};

const defaultLightTheme = {
  color_bg_base: "#ffffff",
  color_bg_container: "#ffffff",
  color_border: "#d9d9d9",
  color_link: "#1677ff",
  color_primary: "#61dafb",
  color_text_base: "#000000",
  color_text_description: "#8c8c8c",
};

const seed = async (database: Database, auth: Auth) => {
  const configuredSettings = await database.query.settings.findFirst({
    where: eq(settings.id, 1),
  });
  const translate = getTranslator(configuredSettings?.languageCode ?? "en");
  const existingAdmin = await database.query.user.findFirst({
    where: eq(user.mobile, "09123456789"),
  });
  const defaultRoleId = "3ecb1f52-6d6e-43b9-a8fb-4e0772c9f863";
  if (existingAdmin?.isSystemAdmin) {
    const assignment = await database.query.userRoles.findFirst({
      where: and(
        eq(userRoles.roleId, defaultRoleId),
        eq(userRoles.userId, existingAdmin.id),
      ),
    });
    if (!assignment) throw new Error("Development seed is incomplete.");
    return;
  }
  const passwordHash = await (await auth.$context).password.hash("password123");
  const adminId = randomUUID();
  const now = new Date();
  await database.transaction(async (transaction) => {
    if (
      (await transaction.query.user.findFirst()) ||
      (await transaction.query.roles.findFirst()) ||
      (await transaction.query.calendarDates.findFirst()) ||
      (await transaction.query.files.findFirst())
    )
      throw new Error("Development seed requires an empty business database.");
    await transaction.insert(user).values({
      id: adminId,
      email: internalEmail("09123456789"),
      emailVerified: false,
      firstName: translate("seedAdminFirstName"),
      lastName: translate("seedAdminLastName"),
      mobile: "09123456789",
      name: translate("seedAdminName"),
      isSystemAdmin: true,
      status: "active",
      username: "admin",
      displayUsername: "admin",
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(account).values({
      id: randomUUID(),
      accountId: adminId,
      userId: adminId,
      providerId: "credential",
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    await transaction
      .insert(calendarDates)
      .values([{ date: "2026-09-15" }, { date: "2026-09-23" }]);
    await transaction
      .insert(roles)
      .values({ id: defaultRoleId, name: translate("seedDefaultRole") });
    await transaction.insert(rolePermissions).values(
      permissionKeys.map((permission) => ({
        permission,
        roleId: defaultRoleId,
      })),
    );
    await transaction
      .insert(userRoles)
      .values({ roleId: defaultRoleId, userId: adminId });
  });
};

export const initializeDatabase = async (
  config: ServerConfig,
  database: Database,
  auth: Auth,
) => {
  await migrate(database, {
    migrationsFolder: fileURLToPath(
      new URL("../../../drizzle", import.meta.url),
    ),
  });
  await database
    .insert(settings)
    .values({
      darkTheme: JSON.stringify(defaultDarkTheme),
      id: 1,
      languageCode: "en",
      lightTheme: JSON.stringify(defaultLightTheme),
    })
    .onConflictDoNothing();
  if (config.seedDevelopmentData) await seed(database, auth);
};
