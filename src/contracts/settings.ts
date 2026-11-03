export type PublicSettingsLanguage = {
  code: string;
  direction: "ltr" | "rtl";
  calendar: "gregorian" | "jalali";
  name: string;
  native_name: string;
};

export type PublicSettingsResponse = {
  language: PublicSettingsLanguage;
  dark_theme: unknown;
  light_theme: unknown;
  dark_logo?: { id: string; url: string };
  light_logo?: { id: string; url: string };
};
