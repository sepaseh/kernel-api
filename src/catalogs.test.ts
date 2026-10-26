import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { supportedLanguages } from "./contracts/locales.ts";
import { apiMessages } from "./infrastructure/localization/catalogs/index.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const catalogDirectory = path.join(
  root,
  "infrastructure/localization/catalogs",
);
const localeCodes = supportedLanguages.map(({ code }) => code);
const catalogPaths = localeCodes.map(
  (code) => `src/infrastructure/localization/catalogs/${code}.ts`,
);
// These individual words have the same spelling in the named languages.
const sameSpelling = new Map([
  ["de", ["seedAdminFirstName", "seedAdminLastName"]],
  ["es", ["permissionRoles"]],
]);
const placeholders = (value: string) => {
  const pattern = /\{\{\s*-?\s*([\w.]+)(?:\s*,[^}]*)?\s*\}\}/g;
  assert.ok(!value.replaceAll(pattern, "").match(/\{\{|\}\}/), value);
  return [
    ...new Set([...value.matchAll(pattern)].map((match) => match[1])),
  ].sort();
};

test("all ten supported API languages have complete flat messages and matching interpolation", () => {
  assert.equal(localeCodes.length, 10);
  assert.deepEqual(Object.keys(apiMessages).sort(), [...localeCodes].sort());
  const english = apiMessages.en;
  for (const [locale, messages] of Object.entries(apiMessages)) {
    assert.deepEqual(
      Object.keys(messages).sort(),
      Object.keys(english).sort(),
      locale,
    );
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, "string", `${locale}:${key}`);
      assert.ok(value.trim(), `${locale}:${key}`);
      assert.deepEqual(
        placeholders(value),
        placeholders(english[key as keyof typeof english]),
        `${locale}:${key}`,
      );
    }
    if (locale !== "en") {
      const englishCopies = Object.keys(messages).filter(
        (key) =>
          messages[key as keyof typeof messages] ===
          english[key as keyof typeof english],
      );
      assert.deepEqual(
        englishCopies.sort(),
        [...(sameSpelling.get(locale) ?? [])].sort(),
        `${locale} must translate every message except its reviewed same-spelling words`,
      );
    }
  }
});

test("physical catalogs and canonical registry objects match supported-language metadata", async () => {
  assert.deepEqual(
    (await readdir(catalogDirectory)).sort(),
    [...localeCodes.map((code) => `${code}.ts`), "index.ts"].sort(),
  );
  for (const code of localeCodes) {
    const module = await import(
      `./infrastructure/localization/catalogs/${code}.ts`
    );
    const name = `api${code[0].toUpperCase()}${code.slice(1)}`;
    assert.deepEqual(Object.keys(module), [name], code);
    assert.equal(apiMessages[code], module[name], code);
  }
});

test("catalog keys exactly cover the independent erased application vocabulary", async () => {
  const source = ts.createSourceFile(
    "localization.ts",
    await readFile(path.join(root, "application/localization.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  assert.ok(source.statements.every(ts.isTypeAliasDeclaration));
  const declaration = source.statements.find(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === "ApiMessageKey",
  );
  assert.ok(
    declaration &&
      ts.isTypeAliasDeclaration(declaration) &&
      ts.isUnionTypeNode(declaration.type),
  );
  const keys = declaration.type.types.map((type) => {
    assert.ok(ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal));
    return type.literal.text;
  });
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys.sort(), Object.keys(apiMessages.en).sort());
});

test("Sonar duplication exception names exactly ten data files and leaves all source, rules and coverage analyzed", async () => {
  const properties = await readFile(
    path.join(root, "../sonar-project.properties"),
    "utf8",
  );
  const entries = properties
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));
  const propertyNames = entries.map((line) => line.slice(0, line.indexOf("=")));
  assert.equal(
    new Set(propertyNames).size,
    entries.length,
    "Sonar properties must be unique",
  );
  const duplication = entries.filter((line) =>
    line.startsWith("sonar.cpd.exclusions="),
  );
  assert.equal(duplication.length, 1);
  assert.deepEqual(
    duplication[0].slice("sonar.cpd.exclusions=".length).split(",").sort(),
    [...catalogPaths].sort(),
  );
  assert.ok(
    !entries.some((line) =>
      /^sonar\.(?:coverage\.exclusions|issue\.ignore[.=]|global\.exclusions|inclusions=)/.test(
        line,
      ),
    ),
  );
  assert.ok(entries.includes("sonar.sources=src,scripts"));
  assert.ok(
    entries.includes("sonar.exclusions=src/**/*.test.ts,scripts/*.test.mjs"),
  );
});
