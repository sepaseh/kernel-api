import type { ApiTranslationResource } from "../../../application/localization.ts";
import type { LocaleCode } from "../../../contracts/locales.ts";
import { apiAr } from "./ar.ts";
import { apiDe } from "./de.ts";
import { apiEn } from "./en.ts";
import { apiEs } from "./es.ts";
import { apiFa } from "./fa.ts";
import { apiFr } from "./fr.ts";
import { apiIt } from "./it.ts";
import { apiPt } from "./pt.ts";
import { apiRu } from "./ru.ts";
import { apiTr } from "./tr.ts";

export const apiMessages = {
  ar: apiAr,
  de: apiDe,
  en: apiEn,
  es: apiEs,
  fa: apiFa,
  fr: apiFr,
  it: apiIt,
  pt: apiPt,
  ru: apiRu,
  tr: apiTr,
} satisfies Record<LocaleCode, ApiTranslationResource>;
