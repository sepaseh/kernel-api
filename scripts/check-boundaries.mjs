import { readdir, readFile, realpath } from "node:fs/promises";
import { isBuiltin } from "node:module";
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

const isErasedTypeReference = (node) => {
  if (ts.isImportTypeNode(node)) return true;
  if (ts.isImportDeclaration(node))
    return node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
  if (ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node))
    return node.isTypeOnly;

  return false;
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
      typeOnly: isErasedTypeReference(node),
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

const applicationImportViolation = ({ root, specifier, target, typeOnly }) => {
  if (!specifier.startsWith(".")) {
    const nativeName = specifier.startsWith("node:")
      ? specifier.slice(5)
      : specifier;
    return isBuiltin(specifier) &&
      !["http", "http2", "https", "sqlite"].includes(nativeName)
      ? undefined
      : "Application modules must not depend on external packages, HTTP transport or database modules";
  }

  const application = path.join(root, "src", "application");
  const contracts = path.join(root, "src", "contracts");
  if (!target || (!inside(application, target) && !inside(contracts, target)))
    return "Application modules must depend only on local application/contracts modules";

  const vocabulary = path.join(application, "localization.ts");
  if (inside(vocabulary, target) && (target !== vocabulary || !typeOnly))
    return "Application message vocabulary references must be fully erased types";

  return undefined;
};

const catalogDirectory = (root) =>
  path.join(root, "src", "infrastructure", "localization", "catalogs");
const catalogImportViolation = ({
  root,
  file,
  specifier,
  target,
  typeOnly,
}) => {
  const directory = catalogDirectory(root);
  const vocabulary = path.join(root, "src", "application", "localization.ts");
  const locales = path.join(root, "src", "contracts", "locales.ts");
  if (specifier.startsWith(".") && typeOnly && target === vocabulary)
    return undefined;
  if (path.basename(file) === "index.ts" && specifier.startsWith(".")) {
    if (typeOnly && target === locales) return undefined;
    if (
      !typeOnly &&
      target &&
      path.dirname(target) === directory &&
      target !== file
    )
      return undefined;
  }
  return "Static catalogs may load only local catalog data; application vocabulary and locale metadata references must be fully erased types";
};

const catalogObject = (declaration) => {
  let value = declaration.initializer;
  while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)))
    value = value.expression;
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
};

const literalProperties = (object) => {
  const keys = new Set();
  if (!object?.properties.length) return false;
  return object.properties.every((property) => {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
      !ts.isStringLiteral(property.initializer)
    )
      return false;
    const key = property.name.text;
    if (!key || keys.has(key) || !property.initializer.text.trim())
      return false;
    keys.add(key);
    return true;
  });
};

export const catalogDataViolation = (content, filename) => {
  const source = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = source.statements.filter(ts.isVariableStatement);
  const allowedStatement = (statement) =>
    declarations.includes(statement) ||
    (ts.isImportDeclaration(statement) && isErasedTypeReference(statement));
  if (
    source.parseDiagnostics.length ||
    !source.statements.every(allowedStatement)
  )
    return "Catalog data must contain only erased imports and its exported literal object";
  const statement = declarations[0];
  if (
    declarations.length !== 1 ||
    statement.declarationList.flags !== ts.NodeFlags.Const ||
    statement.declarationList.declarations.length !== 1 ||
    statement.modifiers?.length !== 1 ||
    statement.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword
  )
    return "Catalog data must declare exactly one exported const";
  const declaration = statement.declarationList.declarations[0];
  const code = path.basename(filename, ".ts");
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.name.text !== `api${code[0].toUpperCase()}${code.slice(1)}` ||
    !literalProperties(catalogObject(declaration))
  )
    return "Catalog data must be a flat object of unique literal string messages";
  return undefined;
};

const databasePackages = ["@libsql/client", "drizzle-orm"];
const databaseImports = {
  "src/infrastructure/db/client.ts": ["@libsql/client", "drizzle-orm/libsql"],
  "src/infrastructure/db/schema.ts": ["drizzle-orm", "drizzle-orm/sqlite-core"],
  ...Object.fromEntries(
    [
      "account",
      "calendar",
      "files",
      "identity",
      "roles",
      "settings",
      "users",
    ].map((name) => [
      `src/infrastructure/persistence/${name}.ts`,
      ["drizzle-orm"],
    ]),
  ),
};
const databaseImportViolation = ({
  root,
  file,
  specifier,
  target,
  resolvedPackage,
}) => {
  const packageDirectories = ["@libsql", "drizzle-orm"].map((name) =>
    path.join(root, "node_modules", name),
  );
  const isDatabaseReference =
    specifier === "drizzle-orm" ||
    specifier.startsWith("drizzle-orm/") ||
    specifier.startsWith("@libsql/") ||
    resolvedPackage?.startsWith("@libsql/") ||
    databasePackages.includes(resolvedPackage) ||
    (target &&
      packageDirectories.some((directory) => inside(directory, target)));
  if (!isDatabaseReference) return undefined;
  const owner = path.relative(root, file).split(path.sep).join("/");
  const expectedPackage =
    specifier === "@libsql/client" ? "@libsql/client" : "drizzle-orm";
  const packageRoot = databasePackages.includes(resolvedPackage)
    ? path.join(root, "node_modules", expectedPackage)
    : undefined;
  if (
    !databaseImports[owner]?.includes(specifier) ||
    resolvedPackage !== expectedPackage ||
    !packageRoot ||
    !target ||
    !inside(packageRoot, target)
  )
    return "Database SDK imports must use exact declared owners and their real installed packages";
  return undefined;
};

export const boundaryViolation = ({
  root,
  file,
  specifier,
  resolved,
  typeOnly,
  resolvedPackage,
}) => {
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
  if (inside(path.join(root, "src", "application"), file))
    return applicationImportViolation({ root, specifier, target, typeOnly });
  if (inside(catalogDirectory(root), file))
    return catalogImportViolation({ root, file, specifier, target, typeOnly });

  const sdkRoot = path.join(root, "node_modules", "@aws-sdk");
  if (
    specifier.startsWith("@aws-sdk/") ||
    resolvedPackage?.startsWith("@aws-sdk/") ||
    (target && inside(sdkRoot, target))
  ) {
    const adapter = path.join(root, "src/infrastructure/storage/minio.ts");
    const packageRoot = path.join(sdkRoot, "client-s3");
    if (
      file !== adapter ||
      specifier !== "@aws-sdk/client-s3" ||
      resolvedPackage !== "@aws-sdk/client-s3" ||
      !target ||
      !inside(packageRoot, target)
    )
      return "The S3 SDK must resolve to its installed package and stay inside the owned MinIO adapter";
  }

  return databaseImportViolation({
    root,
    file,
    specifier,
    target,
    resolvedPackage,
  });
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
      const content = await readFile(file, "utf8");
      const edges = inspectImports(content, file);
      const dataViolation =
        inside(catalogDirectory(root), file) &&
        path.basename(file) !== "index.ts"
          ? catalogDataViolation(content, file)
          : undefined;
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
            typeOnly: edge.typeOnly,
            resolvedPackage: module?.packageId?.name,
          });
          return violation
            ? `${path.relative(root, file)}:${edge.line}: ${edge.specifier ?? "[computed import]"}: ${violation}`
            : undefined;
        }),
      );
      return [
        ...(dataViolation
          ? [`${path.relative(root, file)}:1: ${dataViolation}`]
          : []),
        ...importViolations.filter((violation) => violation !== undefined),
      ];
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
      `Source boundaries checked: ${result.files} production files; contracts are pure and application imports remain framework-free.`,
    );
}
