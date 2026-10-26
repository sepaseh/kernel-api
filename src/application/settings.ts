import { supportedLanguages } from "../contracts/locales.ts";
import type { PublicSettingsResponse } from "../contracts/settings.ts";
import { authorizeActor } from "./authorization.ts";
import { ApplicationError } from "./errors.ts";
import type { Actor } from "./models.ts";
import type {
  SettingsFileUrl,
  SettingsLogo,
  SettingsRepository,
} from "./ports/settings.ts";
import { requiredString } from "./validation.ts";

const paletteKeys = [
  "color_bg_base",
  "color_bg_container",
  "color_border",
  "color_link",
  "color_primary",
  "color_text_base",
  "color_text_description",
] as const;

const parsePalette = (value: unknown, name: string): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApplicationError("invalid", "fieldRequired", { field: name });
  const record = value as Record<string, unknown>;
  const entries = paletteKeys.map((key) => {
    const color = record[key];
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color))
      throw new ApplicationError("invalid", "colorInvalid", { field: name });
    return [key, color];
  });
  return Object.fromEntries(entries);
};

export const createSettingsService = (
  repository: SettingsRepository,
  fileUrl: SettingsFileUrl,
) => {
  const publicLogo = (file?: SettingsLogo) => {
    if (!file) return undefined;
    const url = fileUrl(file);
    return url ? { id: file.id, url } : undefined;
  };

  const get = async (): Promise<PublicSettingsResponse> => {
    const value = await repository.read();
    if (!value)
      throw new ApplicationError("internal", "settingsNotInitialized");
    const language = supportedLanguages.find(
      ({ code }) => code === value.languageCode,
    );
    if (!language) throw new ApplicationError("internal", "languageInvalid");
    const darkLogo = publicLogo(value.darkLogo);
    const lightLogo = publicLogo(value.lightLogo);
    return {
      ...(darkLogo && { dark_logo: darkLogo }),
      dark_theme: value.darkTheme,
      language,
      ...(lightLogo && { light_logo: lightLogo }),
      light_theme: value.lightTheme,
    };
  };

  return {
    get,
    getLanguageCode: async () => (await repository.readLanguageCode()) ?? "en",
    listLanguages: () => supportedLanguages,
    update: async (actor: Actor, input: Record<string, unknown>) => {
      if (!actor.account.isSystemAdmin)
        authorizeActor(actor, { permission: "settings.update" });
      const suppliedLanguage =
        input.language_code === undefined
          ? undefined
          : requiredString(input.language_code, "language_code");
      if (
        suppliedLanguage !== undefined &&
        !actor.account.isSystemAdmin &&
        suppliedLanguage !== (await repository.readLanguageCode())
      )
        throw new ApplicationError("forbidden", "systemAdminRequired");
      if (
        suppliedLanguage !== undefined &&
        actor.account.isSystemAdmin &&
        !supportedLanguages.some(({ code }) => code === suppliedLanguage)
      )
        throw new ApplicationError("not-found", "languageNotFound");
      const darkTheme = parsePalette(input.dark_theme, "dark_theme");
      const lightTheme = parsePalette(input.light_theme, "light_theme");
      // Ordinary branding saves must not overwrite a concurrent language change.
      const result = await repository.save({
        darkLogoId:
          typeof input.dark_logo_id === "string" && input.dark_logo_id
            ? input.dark_logo_id
            : undefined,
        darkTheme,
        ...(actor.account.isSystemAdmin &&
          suppliedLanguage !== undefined && {
            languageCode: suppliedLanguage,
          }),
        lightLogoId:
          typeof input.light_logo_id === "string" && input.light_logo_id
            ? input.light_logo_id
            : undefined,
        lightTheme,
      });
      if (result === "missing")
        throw new ApplicationError("internal", "settingsNotInitialized");
      if (result === "invalid-logo")
        throw new ApplicationError("not-found", "publicLogoNotFound");
      return get();
    },
  };
};
