import type { ApiTranslationResource } from "../../../application/localization.ts";
import type { LocaleCode } from "../../../contracts/locales.ts";
import { ar } from "./ar.ts";
import { de } from "./de.ts";
import { en } from "./en.ts";
import { es } from "./es.ts";
import { fa } from "./fa.ts";
import { fr } from "./fr.ts";
import { it } from "./it.ts";
import { pt } from "./pt.ts";
import { ru } from "./ru.ts";
import { tr } from "./tr.ts";

export const apiMessages = {
  ar,
  de,
  en,
  es,
  fa,
  fr,
  it,
  pt,
  ru,
  tr,
} satisfies Record<LocaleCode, ApiTranslationResource>;
