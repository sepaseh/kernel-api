import type { FileContext } from "./files.ts";

export type PublicSettingsLanguage = {
  code: string;
  direction: "ltr" | "rtl";
  calendar: "gregorian" | "jalali";
  name: string;
  native_name: string;
};

export type ImageSettings = {
  height: number;
  size: number;
  width: number;
};

export type SettingsImageConfiguration = Record<FileContext, ImageSettings>;

export const defaultImageSettings = {
  contents: { height: 630, size: 2_000_000, width: 1200 },
  logo: { height: 256, size: 1_000_000, width: 256 },
} as const satisfies SettingsImageConfiguration;

const isPositiveInteger = (value: unknown, max: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= max;

const parseImageContext = (value: unknown): ImageSettings | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const { height, size, width } = value as Record<string, unknown>;
  if (
    !isPositiveInteger(height, 8192) ||
    !isPositiveInteger(size, Number.MAX_SAFE_INTEGER) ||
    !isPositiveInteger(width, 8192)
  )
    return undefined;
  return { height, size, width };
};

export const parseImageSettings = (
  value: unknown,
): SettingsImageConfiguration | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const contents = parseImageContext(record.contents);
  const logo = parseImageContext(record.logo);
  return contents && logo ? { contents, logo } : undefined;
};

export type PublicSettingsResponse = {
  language: PublicSettingsLanguage;
  dark_theme: unknown;
  image_settings: SettingsImageConfiguration;
  light_theme: unknown;
  dark_logo?: { id: string; url: string };
  light_logo?: { id: string; url: string };
};
