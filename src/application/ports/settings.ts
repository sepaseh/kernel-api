import type { SettingsImageConfiguration } from "../../contracts/settings.ts";

export type SettingsLogo = {
  bucket: string;
  id: string;
  objectKey: string;
  visibility: "private" | "public";
};

type SettingsRecord = {
  darkLogo?: SettingsLogo;
  darkTheme: unknown;
  imageSettings: SettingsImageConfiguration;
  languageCode: string;
  lightLogo?: SettingsLogo;
  lightTheme: unknown;
};

type SettingsUpdate = {
  darkLogoId?: string;
  darkTheme: Record<string, string>;
  imageSettings?: SettingsImageConfiguration;
  languageCode?: string;
  lightLogoId?: string;
  lightTheme: Record<string, string>;
};

export type SettingsRepository = {
  read(): Promise<SettingsRecord | undefined>;
  readImageSettings(): Promise<SettingsImageConfiguration | undefined>;
  readLanguageCode(): Promise<string | undefined>;
  save(input: SettingsUpdate): Promise<"saved" | "missing" | "invalid-logo">;
};

export type SettingsFileUrl = (file: SettingsLogo) => string | undefined;
