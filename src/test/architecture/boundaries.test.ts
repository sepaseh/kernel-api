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

const unwrapExpression = (node: ts.Node): ts.Node => {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  return node;
};

const inspectSource = (file: string, content: string) => {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: Array<{ node: ts.Node; specifier: string }> = [];
  const webUses: ts.Node[] = [];
  let checker: ts.TypeChecker | undefined;
  const resolvesLocally = (name: ts.Identifier) => {
    if (!checker) {
      const options: ts.CompilerOptions = {
        noLib: true,
        noResolve: true,
        types: [],
      };
      const host = ts.createCompilerHost(options);
      host.getSourceFile = (filename) =>
        path.resolve(filename) === path.resolve(file) ? source : undefined;
      checker = ts.createProgram([file], options, host).getTypeChecker();
    }
    return Boolean(checker.getSymbolAtLocation(name)?.declarations?.length);
  };
  const httpGlobals = new Set([
    "File",
    "FormData",
    "Headers",
    "Request",
    "Response",
    "URLSearchParams",
  ]);
  const isHttpMemberName = (name: string) =>
    name === "fetch" || httpGlobals.has(name);
  const isGlobalThis = (receiver: ts.Node) => {
    const name = unwrapExpression(receiver);
    return (
      ts.isIdentifier(name) &&
      name.text === "globalThis" &&
      !resolvesLocally(name)
    );
  };
  const isLiteralHttpName = (node: ts.Node) => {
    const literal = unwrapExpression(node);
    return ts.isStringLiteralLike(literal) && isHttpMemberName(literal.text);
  };
  const usesGlobalHttpMember = (node: ts.Node) => {
    if (ts.isQualifiedName(node))
      return isHttpMemberName(node.right.text) && isGlobalThis(node.left);
    if (ts.isPropertyAccessExpression(node))
      return isHttpMemberName(node.name.text) && isGlobalThis(node.expression);
    return (
      ts.isElementAccessExpression(node) &&
      isLiteralHttpName(node.argumentExpression) &&
      isGlobalThis(node.expression)
    );
  };
  const isHttpBindingKey = (node: ts.Node) => {
    if (ts.isComputedPropertyName(node))
      return isLiteralHttpName(node.expression);
    return ts.isIdentifier(node)
      ? isHttpMemberName(node.text)
      : isLiteralHttpName(node);
  };
  const destructuresGlobalHttpMember = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isGlobalThis(node.initializer)
    )
      return node.name.elements.some(
        (element) =>
          !element.dotDotDotToken &&
          isHttpBindingKey(element.propertyName ?? element.name),
      );
    if (
      !ts.isBinaryExpression(node) ||
      node.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    )
      return false;

    const target = unwrapExpression(node.left);
    return (
      ts.isObjectLiteralExpression(target) &&
      isGlobalThis(node.right) &&
      target.properties.some(
        (property) =>
          (ts.isPropertyAssignment(property) ||
            ts.isShorthandPropertyAssignment(property)) &&
          isHttpBindingKey(property.name),
      )
    );
  };
  const usesBareHttpGlobal = (node: ts.Node) => {
    if (ts.isCallExpression(node))
      return (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "fetch" &&
        !resolvesLocally(node.expression)
      );

    const name = ts.isTypeReferenceNode(node)
      ? node.typeName
      : ts.isNewExpression(node)
        ? node.expression
        : undefined;
    return (
      name !== undefined &&
      ts.isIdentifier(name) &&
      httpGlobals.has(name.text) &&
      !resolvesLocally(name)
    );
  };
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

    if (
      usesBareHttpGlobal(node) ||
      usesGlobalHttpMember(node) ||
      destructuresGlobalHttpMember(node)
    )
      webUses.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const location = (node: ts.Node) =>
    `${path.relative(sourceRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  return { imports, location, webUses };
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
  if (!specifier.endsWith(".ts")) return false;

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

test("application rejects runtime vocabulary imports, alternate paths, and infrastructure catalogs", () => {
  const file = path.join(applicationRoot, "message-runtime-fixture.ts");
  for (const source of [
    'import { ApiMessageKey } from "./localization.ts";',
    'import { ApiMessageKey } from "./localization.js";',
    'import { ApiMessageKey } from "./localization";',
    'import type { ApiMessageKey } from "./localization.js";',
    'import type { ApiMessageKey } from "./localization";',
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

test("application HTTP checks detect global names without rejecting local fetch", () => {
  const file = path.join(applicationRoot, "fetch-fixture.ts");
  const content = [
    'fetch("fixture");',
    'globalThis.fetch("fixture");',
    'globalThis["fetch"]("fixture");',
    'new globalThis.Request("fixture");',
    "type HttpRequest = globalThis.Request;",
    'function local(fetch: (value: string) => string) { fetch("fixture"); }',
    "function localGlobal(globalThis: { fetch(): void }) { globalThis.fetch(); }",
    'client.fetch("fixture");',
    "globalThis.setTimeout(() => {});",
  ].join("\n");
  const { location, webUses } = inspectSource(file, content);
  assert.deepEqual(webUses.map(location), [
    `application${path.sep}fetch-fixture.ts:1`,
    `application${path.sep}fetch-fixture.ts:2`,
    `application${path.sep}fetch-fixture.ts:3`,
    `application${path.sep}fetch-fixture.ts:4`,
    `application${path.sep}fetch-fixture.ts:5`,
  ]);
});

test("application HTTP checks distinguish bare globals from local types and constructors", () => {
  const file = path.join(applicationRoot, "http-name-fixture.ts");
  const content = [
    "type TransportResponse = Response;",
    'new Request("fixture");',
    "function localType() { type Response = string; let value: Response; }",
    "function localConstructor() { class Request {}; new Request(); }",
  ].join("\n");
  const { location, webUses } = inspectSource(file, content);
  assert.deepEqual(webUses.map(location), [
    `application${path.sep}http-name-fixture.ts:1`,
    `application${path.sep}http-name-fixture.ts:2`,
  ]);
});

test("application HTTP checks detect destructuring from the real globalThis", () => {
  const file = path.join(applicationRoot, "http-binding-fixture.ts");
  const content = [
    "const { fetch: transport } = globalThis;",
    '({ ["Request" as const]: transportRequest } = (globalThis));',
    "function withDefault({ Response } = globalThis) {}",
    "const { setTimeout: fetch } = globalThis;",
    "const { Headers } = other;",
    "function local(globalThis: Fixture) { const { fetch } = globalThis; }",
    "function assignLocal(globalThis: Fixture) { ({ Request } = globalThis); }",
  ].join("\n");
  const { location, webUses } = inspectSource(file, content);
  assert.deepEqual(webUses.map(location), [
    `application${path.sep}http-binding-fixture.ts:1`,
    `application${path.sep}http-binding-fixture.ts:2`,
    `application${path.sep}http-binding-fixture.ts:3`,
  ]);
});

test("application imports remain framework-free and inward-facing", async () => {
  const files = await sourceFiles(applicationRoot);
  assert.ok(files.length, "The application boundary must contain source files");
  const violations: string[] = [];
  for (const file of files) {
    const { imports, location, webUses } = await inspect(file);
    for (const { node, specifier } of imports) {
      const allowed = allowedApplicationImport(file, node, specifier);
      if (!allowed) violations.push(`${location(node)} imports ${specifier}`);
    }
    for (const node of webUses) {
      violations.push(
        `${location(node)} uses an HTTP/browser type, constructor or global function`,
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
          (isBuiltin(specifier) && !/^(?:node:)?sqlite$/.test(specifier));
      if (!allowed) violations.push(`${location(node)} imports ${specifier}`);
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});
