import assert from "node:assert/strict";
import { test } from "node:test";

import { supportedLanguages } from "../../contracts/locales.ts";
import { apiMessages } from "./catalogs/index.ts";
import { getTranslator, resolveLanguage } from "./i18n.ts";

test("the real translation engine returns every message in each supported language", () => {
  for (const { code } of supportedLanguages) {
    assert.equal(resolveLanguage(code), code);
    const translate = getTranslator(code);
    for (const [key, value] of Object.entries(apiMessages[code])) {
      assert.equal(
        translate(key as keyof typeof apiMessages.en, {
          field: "synthetic_field",
        }),
        value.replaceAll("{{field}}", "synthetic_field"),
        `${code}:${key}`,
      );
    }
  }
});

test("unknown, regional and prototype-like language names consistently use English", () => {
  for (const code of [
    "",
    "unavailable",
    "fa-IR",
    "en-US",
    "__proto__",
    "constructor",
    "toString",
    "FA",
  ]) {
    assert.equal(resolveLanguage(code), "en", code);
    assert.equal(
      getTranslator(code)("notFound"),
      apiMessages.en.notFound,
      code,
    );
  }
});

test("interpolation preserves numeric and plain-text values without mutating catalog data", () => {
  for (const { code } of supportedLanguages) {
    for (const field of [17, "<synthetic>&value", "{{nested}}"])
      assert.equal(
        getTranslator(code)("fieldRequired", { field }),
        apiMessages[code].fieldRequired.replace("{{field}}", String(field)),
        code,
      );
    assert.ok(apiMessages[code].fieldRequired.includes("{{field}}"));
  }
});
