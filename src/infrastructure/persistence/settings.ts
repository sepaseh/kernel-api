import { eq, inArray } from "drizzle-orm";

import type { SettingsRepository } from "../../application/ports/settings.ts";
import type { Database } from "../db/client.ts";
import { files, settings } from "../db/schema.ts";

export const createDrizzleSettingsRepository = (
  database: Database,
): SettingsRepository => ({
  read: async () => {
    const value = await database.query.settings.findFirst({
      where: eq(settings.id, 1),
    });
    if (!value) return undefined;
    const logoIds = [value.darkLogoId, value.lightLogoId].filter(
      (id): id is string => Boolean(id),
    );
    const logoFiles = logoIds.length
      ? await database.select().from(files).where(inArray(files.id, logoIds))
      : [];
    const byId = new Map(logoFiles.map((file) => [file.id, file]));
    return {
      darkLogo: value.darkLogoId ? byId.get(value.darkLogoId) : undefined,
      darkTheme: JSON.parse(value.darkTheme) as unknown,
      languageCode: value.languageCode,
      lightLogo: value.lightLogoId ? byId.get(value.lightLogoId) : undefined,
      lightTheme: JSON.parse(value.lightTheme) as unknown,
    };
  },
  readLanguageCode: async () => {
    const [value] = await database
      .select({ languageCode: settings.languageCode })
      .from(settings)
      .where(eq(settings.id, 1));
    return value?.languageCode;
  },
  save: async (input) =>
    database.transaction<"saved" | "missing" | "invalid-logo">(
      async (transaction) => {
        const value = await transaction.query.settings.findFirst({
          where: eq(settings.id, 1),
        });
        if (!value) return "missing";
        const logoIds = [input.darkLogoId, input.lightLogoId].filter(
          (id): id is string => Boolean(id),
        );
        if (logoIds.length) {
          const logoFiles = await transaction
            .select({ id: files.id, visibility: files.visibility })
            .from(files)
            .where(inArray(files.id, logoIds));
          const byId = new Map(logoFiles.map((file) => [file.id, file]));
          if (logoIds.some((id) => byId.get(id)?.visibility !== "public"))
            return "invalid-logo";
        }
        await transaction
          .update(settings)
          .set({
            darkLogoId: input.darkLogoId ?? null,
            darkTheme: JSON.stringify(input.darkTheme),
            ...(input.languageCode !== undefined && {
              languageCode: input.languageCode,
            }),
            lightLogoId: input.lightLogoId ?? null,
            lightTheme: JSON.stringify(input.lightTheme),
          })
          .where(eq(settings.id, 1));
        return "saved";
      },
    ),
});
