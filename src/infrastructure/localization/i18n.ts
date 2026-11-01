import { createInstance } from "i18next";

import type {
  ApiMessageKey,
  ApiTranslationResource,
} from "../../application/localization.ts";
import { apiMessages } from "./catalogs/index.ts";

export type Translator = (
  key: ApiMessageKey,
  values?: Record<string, string | number>,
) => string;

const resources: Record<string, { translation: ApiTranslationResource }> =
  Object.fromEntries(
    Object.entries(apiMessages).map(([language, translation]) => [
      language,
      { translation },
    ]),
  );

const instance = createInstance();
void instance.init({
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
  resources,
});

export const resolveLanguage = (language: string): string =>
  Object.hasOwn(resources, language) ? language : "en";

export const getTranslator = (language: string): Translator => {
  const fixed = instance.getFixedT(resolveLanguage(language));
  return (key, values) => fixed(key, values);
};
