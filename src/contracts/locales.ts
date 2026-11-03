import type { PublicSettingsLanguage } from "./settings.ts";

const language = <Code extends string>(
  code: Code,
  name: string,
  nativeName: string,
  direction: PublicSettingsLanguage["direction"] = "ltr",
  calendar: PublicSettingsLanguage["calendar"] = "gregorian",
) =>
  ({
    calendar,
    code,
    direction,
    name,
    native_name: nativeName,
  }) as const;

export const supportedLanguages = [
  language("fa", "Persian", "فارسی", "rtl", "jalali"),
  language("ar", "Arabic", "العربية", "rtl"),
  language("tr", "Turkish", "Türkçe"),
  language("en", "English", "English"),
  language("fr", "French", "Français"),
  language("de", "German", "Deutsch"),
  language("es", "Spanish", "Español"),
  language("it", "Italian", "Italiano"),
  language("ru", "Russian", "Русский"),
  language("pt", "Portuguese", "Português"),
] as const satisfies readonly PublicSettingsLanguage[];

export type LocaleCode = (typeof supportedLanguages)[number]["code"];
