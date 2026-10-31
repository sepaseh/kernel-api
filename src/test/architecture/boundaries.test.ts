import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const applicationRoot = path.join(sourceRoot, "application");
const presentationRoot = path.join(sourceRoot, "presentation");
const transportInfrastructure = ["localization", "logging"].map((name) =>
  path.join(sourceRoot, "infrastructure", name),
);

const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(file)
        : file.endsWith(".ts") && !file.endsWith(".test.ts")
          ? [file]
          : [];
    }),
  );
  return files.flat().sort();
};

const inspectSource = (file: string, content: string) => {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: Array<{ node: ts.Node; specifier: string }> = [];
  const webTypes: ts.Node[] = [];
  const httpGlobals = new Set([
    "File",
    "FormData",
    "Headers",
    "Request",
    "Response",
    "URLSearchParams",
  ]);
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push({ node, specifier: node.moduleSpecifier.text });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      imports.push({ node, specifier: node.argument.literal.text });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      imports.push({
        node,
        specifier:
          argument && ts.isStringLiteralLike(argument)
            ? argument.text
            : "[non-literal import]",
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      imports.push({ node, specifier: node.moduleReference.expression.text });
    }

    const name = ts.isTypeReferenceNode(node)
      ? node.typeName
      : ts.isNewExpression(node)
        ? node.expression
        : undefined;
    if (name && ts.isIdentifier(name) && httpGlobals.has(name.text)) {
      webTypes.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const location = (node: ts.Node) =>
    `${path.relative(sourceRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  return { imports, location, webTypes };
};

const inspect = async (file: string) =>
  inspectSource(file, await readFile(file, "utf8"));

const isErasedTypeReference = (node: ts.Node) => {
  if (ts.isImportTypeNode(node)) return true;
  if (ts.isImportEqualsDeclaration(node)) return node.isTypeOnly;
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    return (
      !clause.name &&
      clause.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length > 0 &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly)
    );
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    return (
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.length > 0 &&
      node.exportClause.elements.every((element) => element.isTypeOnly)
    );
  }
  return false;
};

const contractsRoot = path.join(sourceRoot, "contracts");
const applicationMessageTypes = path.join(applicationRoot, "localization.ts");
const allowedApplicationImport = (
  file: string,
  node: ts.Node,
  specifier: string,
) => {
  if (!specifier.startsWith("."))
    return isBuiltin(specifier) && !/^(?:node:)?https?(?:2)?$/.test(specifier);
  const target = path.resolve(path.dirname(file), specifier);
  if (inside(applicationMessageTypes, target))
    return target === applicationMessageTypes && isErasedTypeReference(node);
  return inside(applicationRoot, target) || inside(contractsRoot, target);
};

test("application message types are allowed only through erased type references", () => {
  const file = path.join(applicationRoot, "message-type-fixture.ts");
  for (const source of [
    'import type { ApiMessageKey } from "./localization.ts";',
    'import { type ApiMessageKey } from "./localization.ts";',
    'import type ApiTypes = require("./localization.ts");',
    'export type { ApiMessageKey } from "./localization.ts";',
    'export { type ApiMessageKey } from "./localization.ts";',
    'export type * from "./localization.ts";',
    'type Key = import("./localization.ts").ApiMessageKey;',
  ]) {
    const { imports } = inspectSource(file, source);
    assert.equal(imports.length, 1, source);
    assert.ok(
      imports.every(({ node, specifier }) =>
        allowedApplicationImport(file, node, specifier),
      ),
      source,
    );
  }
});

test("application rejects runtime vocabulary imports and infrastructure catalogs", () => {
  const file = path.join(applicationRoot, "message-runtime-fixture.ts");
  for (const source of [
    'import { ApiMessageKey } from "./localization.ts";',
    'import { type ApiMessageKey, runtime } from "./localization.ts";',
    'import * as messages from "./localization.ts";',
    'import "./localization.ts";',
    'export * from "./localization.ts";',
    'export { ApiMessageKey } from "./localization.ts";',
    'const messages = import("./localization.ts");',
    'const messages = require("./localization.ts");',
    'import messages = require("./localization.ts");',
    'import type { ApiMessageKey } from "../infrastructure/localization/catalogs/index.ts";',
    'import type { ApiMessageKey } from "./localization.ts/nested";',
    'import { apiMessages } from "../infrastructure/localization/catalogs/index.ts";',
  ]) {
    const { imports } = inspectSource(file, source);
    assert.equal(imports.length, 1, source);
    assert.ok(
      imports.every(
        ({ node, specifier }) =>
          !allowedApplicationImport(file, node, specifier),
      ),
      source,
    );
  }
});

test("application imports remain framework-free and inward-facing", async () => {
  const files = await sourceFiles(applicationRoot);
  assert.ok(files.length, "The application boundary must contain source files");
  const violations: string[] = [];
  for (const file of files) {
    const { imports, location, webTypes } = await inspect(file);
    for (const { node, specifier } of imports) {
      const allowed = allowedApplicationImport(file, node, specifier);
      if (!allowed) violations.push(`${location(node)} imports ${specifier}`);
    }
    for (const node of webTypes) {
      violations.push(
        `${location(node)} uses an HTTP/browser type or constructor`,
      );
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("presentation consumes services without persistence or auth SDK imports", async () => {
  const files = await sourceFiles(presentationRoot);
  assert.ok(
    files.length,
    "The presentation boundary must contain source files",
  );
  const violations: string[] = [];
  for (const file of files) {
    const { imports, location } = await inspect(file);
    for (const { node, specifier } of imports) {
      const resolved = path.resolve(path.dirname(file), specifier);
      const allowed = specifier.startsWith(".")
        ? [
            applicationRoot,
            presentationRoot,
            contractsRoot,
            ...transportInfrastructure,
          ].some((root) => inside(root, resolved))
        : specifier === "hono" ||
          specifier.startsWith("hono/") ||
          isBuiltin(specifier);
      if (!allowed) violations.push(`${location(node)} imports ${specifier}`);
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});
