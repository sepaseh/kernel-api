import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repository = fileURLToPath(new URL("../", import.meta.url));
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

export const inspectImports = (content, filename = "source.ts") => {
  const source = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  const add = (node, value) =>
    imports.push({
      specifier:
        value && ts.isStringLiteralLike(value) ? value.text : undefined,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      add(node, node.moduleSpecifier);
    else if (ts.isImportTypeNode(node))
      add(
        node,
        ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
      );
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node, node.moduleReference.expression);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      add(node, node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
};

export const boundaryViolation = ({ root, file, specifier, resolved }) => {
  if (!specifier)
    return "Use literal module paths so source boundaries can be checked";
  if (specifier.startsWith("@kernel/"))
    return "Use this project's local source, not former shared packages";
  const target =
    resolved ??
    (specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : undefined);
  const contracts = path.join(root, "src", "contracts");
  if (inside(contracts, file)) {
    if (!specifier.startsWith(".") || !target || !inside(contracts, target))
      return "Wire contracts must depend only on local pure contract modules";
  }
  if (target && !inside(root, target))
    return "Source imports must not escape this repository";
  return undefined;
};

const sourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory())
        return ["test", "__tests__", "node_modules"].includes(entry.name)
          ? []
          : sourceFiles(filename);

      return entry.name.endsWith(".ts") && !/\.(?:test|spec)\./.test(entry.name)
        ? [filename]
        : [];
    }),
  );
  return files.flat();
};

export const checkBoundaries = async (root = repository) => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const violations = [];
  if (manifest.workspaces !== undefined)
    violations.push(
      "The API must have one root package without npm workspaces",
    );
  for (const directory of await readdir(root))
    if (["apps", "packages"].includes(directory))
      violations.push(`Retired source container remains: ${directory}`);
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const { options, errors } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root,
  );
  if (errors.length)
    throw new Error(
      errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, "\n"),
        )
        .join("\n"),
    );
  const cache = ts.createModuleResolutionCache(root, (value) => value, options);
  const files = await sourceFiles(path.join(root, "src"));
  const fileViolations = await Promise.all(
    files.map(async (file) => {
      const edges = inspectImports(await readFile(file, "utf8"), file);
      const importViolations = await Promise.all(
        edges.map(async (edge) => {
          const module =
            edge.specifier &&
            ts.resolveModuleName(edge.specifier, file, options, ts.sys, cache)
              .resolvedModule;
          const resolved = module && (await realpath(module.resolvedFileName));
          const violation = boundaryViolation({
            root,
            file,
            specifier: edge.specifier,
            resolved,
          });
          return violation
            ? `${path.relative(root, file)}:${edge.line}: ${edge.specifier ?? "[computed import]"}: ${violation}`
            : undefined;
        }),
      );
      return importViolations.filter((violation) => violation !== undefined);
    }),
  );
  violations.push(...fileViolations.flat());
  return { files: files.length, violations };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await checkBoundaries();
  if (result.violations.length) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Source boundaries checked: ${result.files} production files. Application/HTTP layer rules are checked separately.`,
    );
}
